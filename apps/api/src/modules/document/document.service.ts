// ══════════════════════════════════════
// Document Service — File Storage
// ══════════════════════════════════════
// Storage structure:
//   storage/persons/{UUID}/         — Individual documents
//   storage/unions/{UUID1}_{UUID2}/ — Couple documents

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_ROOT = process.env.STORAGE_PATH || path.join(process.cwd(), '..', '..', 'storage');

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(private readonly prisma: PrismaService) {
    // Ensure root storage directory exists
    this.ensureDir(STORAGE_ROOT);
    this.ensureDir(path.join(STORAGE_ROOT, 'persons'));
    this.ensureDir(path.join(STORAGE_ROOT, 'unions'));
  }

  /**
   * Upload a file and associate it with a person or union.
   * Creates the UUID-named folder if it doesn't exist.
   */
  async upload(
    file: Express.Multer.File,
    personId?: string,
    unionId?: string,
    category?: string,
    description?: string,
  ) {
    if (!personId && !unionId) {
      throw new BadRequestException('Either personId or unionId must be provided');
    }

    // Determine storage folder
    let folderPath: string;

    if (personId) {
      const person = await this.prisma.person.findUnique({ where: { id: personId } });
      if (!person) throw new NotFoundException(`Person "${personId}" not found`);
      folderPath = path.join(STORAGE_ROOT, 'persons', personId);
    } else {
      const union = await this.prisma.union.findUnique({
        where: { id: unionId! },
        select: { partner1Id: true, partner2Id: true },
      });
      if (!union) throw new NotFoundException(`Union "${unionId}" not found`);
      // Folder named with both partner UUIDs (sorted for consistency)
      const folderName = [union.partner1Id, union.partner2Id].sort().join('_');
      folderPath = path.join(STORAGE_ROOT, 'unions', folderName);
    }

    // Ensure folder exists
    this.ensureDir(folderPath);

    // Generate unique filename to avoid collisions
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .substring(0, 100);
    const uniqueName = `${baseName}_${uuidv4().slice(0, 8)}${ext}`;
    const filePath = path.join(folderPath, uniqueName);

    // Write file to disk
    fs.writeFileSync(filePath, file.buffer);

    // Compute relative storage path for DB
    const storagePath = path.relative(STORAGE_ROOT, filePath).replace(/\\/g, '/');

    // Create DB record
    const document = await this.prisma.document.create({
      data: {
        personId: personId || null,
        unionId: unionId || null,
        filename: file.originalname,
        mimeType: file.mimetype,
        storagePath,
        category: (category as any) || 'OTHER',
        description: description || null,
      },
    });

    this.logger.log(`Uploaded document: ${file.originalname} → ${storagePath}`);
    return document;
  }

  /**
   * Get all documents for a person.
   */
  async findByPerson(personId: string) {
    return this.prisma.document.findMany({
      where: { personId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all documents for a union.
   */
  async findByUnion(unionId: string) {
    return this.prisma.document.findMany({
      where: { unionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a document by ID.
   */
  async findOne(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document "${id}" not found`);
    return doc;
  }

  /**
   * Get the absolute file path for a document (for streaming/download).
   */
  async getFilePath(id: string): Promise<{ absolutePath: string; document: any }> {
    const doc = await this.findOne(id);
    const absolutePath = path.join(STORAGE_ROOT, doc.storagePath);

    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('File not found on disk');
    }

    return { absolutePath, document: doc };
  }

  /**
   * Delete a document (DB record + file on disk).
   */
  async remove(id: string) {
    const doc = await this.findOne(id);
    const absolutePath = path.join(STORAGE_ROOT, doc.storagePath);

    // Delete file from disk
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      this.logger.log(`Deleted file: ${absolutePath}`);
    }

    // Delete DB record
    await this.prisma.document.delete({ where: { id } });

    return { message: 'Document deleted successfully' };
  }

  /**
   * List all files in a person's folder (filesystem-level).
   */
  async listPersonFolder(personId: string) {
    const folderPath = path.join(STORAGE_ROOT, 'persons', personId);
    if (!fs.existsSync(folderPath)) return [];

    return fs.readdirSync(folderPath).map((name) => {
      const stats = fs.statSync(path.join(folderPath, name));
      return { name, size: stats.size, modified: stats.mtime };
    });
  }

  /**
   * List all files in a union's folder (filesystem-level).
   */
  async listUnionFolder(unionId: string) {
    const union = await this.prisma.union.findUnique({
      where: { id: unionId },
      select: { partner1Id: true, partner2Id: true },
    });
    if (!union) throw new NotFoundException(`Union "${unionId}" not found`);

    const folderName = [union.partner1Id, union.partner2Id].sort().join('_');
    const folderPath = path.join(STORAGE_ROOT, 'unions', folderName);
    if (!fs.existsSync(folderPath)) return [];

    return fs.readdirSync(folderPath).map((name) => {
      const stats = fs.statSync(path.join(folderPath, name));
      return { name, size: stats.size, modified: stats.mtime };
    });
  }

  /**
   * Upload a profile photo for a person.
   * Automatically renames the file to `profile.{ext}` and removes any previous profile photo.
   */
  async uploadProfilePhoto(personId: string, file: Express.Multer.File) {
    const person = await this.prisma.person.findUnique({ where: { id: personId } });
    if (!person) throw new NotFoundException(`Person "${personId}" not found`);

    const folderPath = path.join(STORAGE_ROOT, 'persons', personId);
    this.ensureDir(folderPath);

    // Remove any existing profile photo
    this.removeExistingProfilePhotos(folderPath);

    // Save with normalized name
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const profileFileName = `profile${ext}`;
    const filePath = path.join(folderPath, profileFileName);

    fs.writeFileSync(filePath, file.buffer);
    this.logger.log(`Profile photo saved: ${filePath}`);

    return {
      personId,
      filename: profileFileName,
      storagePath: `persons/${personId}/${profileFileName}`,
    };
  }

  /**
   * Get the absolute file path for a person's profile photo.
   */
  getProfilePhotoPath(personId: string): { absolutePath: string; filename: string } | null {
    const folderPath = path.join(STORAGE_ROOT, 'persons', personId);
    if (!fs.existsSync(folderPath)) return null;

    const files = fs.readdirSync(folderPath);
    const profileFile = files.find((name) => name.startsWith('profile.'));
    if (!profileFile) return null;

    return {
      absolutePath: path.join(folderPath, profileFile),
      filename: profileFile,
    };
  }

  /**
   * Check if a person has a profile photo.
   */
  hasProfilePhoto(personId: string): boolean {
    return this.getProfilePhotoPath(personId) !== null;
  }

  /**
   * Remove existing profile photos from a folder.
   */
  private removeExistingProfilePhotos(folderPath: string) {
    if (!fs.existsSync(folderPath)) return;

    const files = fs.readdirSync(folderPath);
    for (const file of files) {
      if (file.startsWith('profile.')) {
        const filePath = path.join(folderPath, file);
        fs.unlinkSync(filePath);
        this.logger.log(`Removed old profile photo: ${filePath}`);
      }
    }
  }

  // ─── Utility ────────────────────────────
  private ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
