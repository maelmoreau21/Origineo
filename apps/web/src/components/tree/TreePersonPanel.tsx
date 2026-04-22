'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { personApi, documentApi, unionApi, relationshipApi } from '@/lib/api';

const CAT_LABELS: Record<string,string> = {
  BIRTH_CERTIFICATE:'Acte naissance', DEATH_CERTIFICATE:'Acte décès',
  MARRIAGE_CERTIFICATE:'Acte mariage', PHOTO:'Photo',
  OFFICIAL_DOCUMENT:'Doc officiel', OTHER:'Autre',
};

function fmt(p:any){
  return {
    id:p.id,
    givenNames:p.givenNames??p.given_names??'',
    usageSurname:p.usageSurname??p.usage_surname??null,
    birthSurname:p.birthSurname??p.birth_surname??null,
    gender:p.gender??'UNKNOWN',
    birthDate:p.birthDate??p.birth_date??null,
    birthPlace:p.birthPlace??p.birth_place??null,
    deathDate:p.deathDate??p.death_date??null,
    deathPlace:p.deathPlace??p.death_place??null,
    professions:p.professions??[],
    notes:p.notes??null,
  };
}
function dn(p:any){if(!p)return'';const n=fmt(p);const s=n.usageSurname||n.birthSurname||'';return`${n.givenNames}${s?` ${s}`:''}`.trim();}
function initials(p:any){const n=fmt(p);const parts=[n.givenNames,n.usageSurname||n.birthSurname||''].filter(Boolean);return parts.map(s=>s[0]).join('').toUpperCase().slice(0,2);}
function fdate(v:string|null){if(!v)return null;try{return new Date(v).toLocaleDateString('fr-FR');}catch{return v;}}

type Tab = 'INFO' | 'DOCS';

export type TreePersonPanelProps = {
  person: any;
  personId: string|null;
  isAdmin: boolean;
  onClose: () => void;
  onCenterOnPerson: () => void;
  onPersonUpdated: () => void;
  token: string|null;
};

export default function TreePersonPanel({person,personId,isAdmin,onClose,onCenterOnPerson,onPersonUpdated,token}:TreePersonPanelProps){
  const [tab,setTab]=useState<Tab>('INFO');
  const [docs,setDocs]=useState<any[]>([]);
  const [unions,setUnions]=useState<any[]>([]);
  const [unionDocs,setUnionDocs]=useState<Record<string,any[]>>({});
  const [editing,setEditing]=useState(false);
  const [editForm,setEditForm]=useState<any>({});
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [uploadCat,setUploadCat]=useState('OTHER');
  const [uploadDesc,setUploadDesc]=useState('');
  const [profileKey,setProfileKey]=useState(0);
  const [hasProfile,setHasProfile]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const profileRef=useRef<HTMLInputElement>(null);

  const p=person?fmt(person):null;

  // Load docs & unions
  useEffect(()=>{
    if(!personId)return;
    documentApi.getByPerson(personId).then(r=>setDocs(r.data||[])).catch(()=>setDocs([]));
    unionApi.getByPerson(personId).then(r=>{
      const u=Array.isArray(r.data)?r.data:[];
      setUnions(u);
      u.forEach((union:any)=>{
        documentApi.getByUnion(union.id).then(r2=>setUnionDocs(prev=>({...prev,[union.id]:r2.data||[]}))).catch(()=>{});
      });
    }).catch(()=>setUnions([]));
    documentApi.hasProfilePhoto(personId).then(r=>setHasProfile(r.data?.hasPhoto||false)).catch(()=>setHasProfile(false));
  },[personId]);

  useEffect(()=>{
    if(p){
      setEditForm({
        givenNames:p.givenNames,usageSurname:p.usageSurname||'',birthSurname:p.birthSurname||'',
        gender:p.gender,birthDate:p.birthDate?new Date(p.birthDate).toISOString().slice(0,10):'',
        birthPlace:p.birthPlace||'',deathDate:p.deathDate?new Date(p.deathDate).toISOString().slice(0,10):'',
        deathPlace:p.deathPlace||'',notes:p.notes||'',
      });
    }
  },[person]);

  const handleSave=useCallback(async()=>{
    if(!personId||!token)return;
    setSaving(true);
    try{
      await personApi.update(personId,{
        givenNames:editForm.givenNames.trim(),
        usageSurname:editForm.usageSurname.trim()||undefined,
        birthSurname:editForm.birthSurname.trim()||undefined,
        gender:editForm.gender,
        birthDate:editForm.birthDate||undefined,
        birthPlace:editForm.birthPlace.trim()||undefined,
        deathDate:editForm.deathDate||undefined,
        deathPlace:editForm.deathPlace.trim()||undefined,
        notes:editForm.notes.trim()||undefined,
      },token);
      setEditing(false);
      onPersonUpdated();
    }catch(e:any){alert(e.message||'Erreur');}
    finally{setSaving(false);}
  },[personId,token,editForm,onPersonUpdated]);

  const handleUploadDoc=useCallback(async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file||!personId||!token)return;
    setUploading(true);
    try{
      await documentApi.upload(file,{personId,category:uploadCat,description:uploadDesc||undefined},token);
      const r=await documentApi.getByPerson(personId);setDocs(r.data||[]);setUploadDesc('');
    }catch(e:any){alert(e.message||'Erreur upload');}
    finally{setUploading(false);if(fileRef.current)fileRef.current.value='';}
  },[personId,token,uploadCat,uploadDesc]);

  const handleDeleteDoc=useCallback(async(docId:string)=>{
    if(!token||!confirm('Supprimer ce document ?'))return;
    try{await documentApi.delete(docId,token);setDocs(prev=>prev.filter(d=>d.id!==docId));}
    catch(e:any){alert(e.message||'Erreur');}
  },[token]);

  const handleDeletePerson=useCallback(async()=>{
    if(!personId||!token||!confirm(`Supprimer ${dn(person)} ?`))return;
    try{await personApi.delete(personId,token);onClose();onPersonUpdated();}
    catch(e:any){alert(e.message||'Erreur');}
  },[personId,token,person,onClose,onPersonUpdated]);

  const handleProfileUpload=useCallback(async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file||!personId||!token)return;
    try{
      await documentApi.uploadProfilePhoto(personId,file,token);
      setProfileKey(k=>k+1);setHasProfile(true);
    }catch(e:any){alert(e.message||'Erreur');}
    finally{if(profileRef.current)profileRef.current.value='';}
  },[personId,token]);

  if(!person||!personId||!p)return null;

  const genderColor=p.gender==='MALE'?'hsl(210,70%,55%)':p.gender==='FEMALE'?'hsl(330,65%,55%)':'hsl(220,12%,55%)';
  const genderBg=p.gender==='MALE'?'hsla(210,70%,55%,0.12)':p.gender==='FEMALE'?'hsla(330,65%,55%,0.12)':'hsla(220,12%,55%,0.08)';
  const profileUrl=documentApi.profilePhotoUrl(personId)+`?v=${profileKey}`;

  return(<>
    <aside className="tpp">
      <div className="tpp-inner">
        {/* Avatar */}
        <div className="tpp-avatar-section">
          <div className="tpp-avatar" style={{borderColor:genderColor,background:genderBg}} onClick={()=>isAdmin&&profileRef.current?.click()}>
            {hasProfile?<img src={profileUrl} alt="" className="tpp-avatar-img"/>:<span className="tpp-avatar-initials">{initials(p)}</span>}
            {isAdmin&&<div className="tpp-avatar-overlay">📷</div>}
          </div>
          {isAdmin&&<input ref={profileRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleProfileUpload}/>}
          <h3 className="tpp-name">{dn(p)}</h3>
          <div className="tpp-meta">
            <span style={{color:genderColor}}>{p.gender==='MALE'?'♂ Homme':p.gender==='FEMALE'?'♀ Femme':'◯ Inconnu'}</span>
            {p.birthDate&&<span>· Né{p.gender==='FEMALE'?'e':''} le {fdate(p.birthDate)}</span>}
          </div>
          <div className="tpp-actions">
            <button className="tpp-btn tpp-btn-accent" onClick={onCenterOnPerson}>🎯 Centrer</button>
            <button className="tpp-btn" onClick={()=>window.location.href=`/person/${personId}`}>📋 Fiche</button>
            <button className="tpp-btn tpp-btn-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="tpp-tabs">
          <button className={`tpp-tab${tab==='INFO'?' tpp-tab-active':''}`} onClick={()=>setTab('INFO')}>Informations</button>
          <button className={`tpp-tab${tab==='DOCS'?' tpp-tab-active':''}`} onClick={()=>setTab('DOCS')}>Documents ({docs.length})</button>
        </div>

        <div className="tpp-content">
          {tab==='INFO'&&(
            <div className="tpp-info">
              {!editing?(
                <div className="tpp-fields">
                  <Field label="Prénoms" value={p.givenNames}/>
                  <Field label="Nom d'usage" value={p.usageSurname}/>
                  <Field label="Nom de naissance" value={p.birthSurname}/>
                  <Field label="Naissance" value={p.birthDate?`${fdate(p.birthDate)}${p.birthPlace?` — ${p.birthPlace}`:''}`:'—'}/>
                  <Field label="Décès" value={p.deathDate?`${fdate(p.deathDate)}${p.deathPlace?` — ${p.deathPlace}`:''}`:'—'}/>
                  {p.professions.length>0&&<Field label="Professions" value={p.professions.join(', ')}/>}
                  {p.notes&&<Field label="Notes" value={p.notes}/>}

                  {/* Unions */}
                  {unions.length>0&&(
                    <div className="tpp-sub-section">
                      <div className="tpp-sub-title">💍 Unions ({unions.length})</div>
                      {unions.map((u:any)=>{
                        const partnerId=u.partner1Id===personId?u.partner2Id:u.partner1Id;
                        const partner=u.partner1Id===personId?u.partner2:u.partner1;
                        return(
                          <div key={u.id} className="tpp-union-card">
                            <span>{dn(partner)||`Personne ${partnerId.slice(0,8)}`}</span>
                            <span className="tpp-badge">{u.type==='MARRIAGE'?'Mariage':u.type==='PACS'?'PACS':u.type==='PARTNERSHIP'?'Partenariat':'Union'}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isAdmin&&(
                    <div className="tpp-admin-actions">
                      <button className="tpp-btn tpp-btn-accent" onClick={()=>setEditing(true)}>✏️ Modifier</button>
                      <button className="tpp-btn tpp-btn-danger" onClick={handleDeletePerson}>🗑 Supprimer</button>
                    </div>
                  )}
                </div>
              ):(
                <div className="tpp-edit-form">
                  <EditField label="Prénoms" value={editForm.givenNames} onChange={v=>setEditForm({...editForm,givenNames:v})}/>
                  <EditField label="Nom d'usage" value={editForm.usageSurname} onChange={v=>setEditForm({...editForm,usageSurname:v})}/>
                  <EditField label="Nom naissance" value={editForm.birthSurname} onChange={v=>setEditForm({...editForm,birthSurname:v})}/>
                  <div className="tpp-edit-field">
                    <label>Genre</label>
                    <select value={editForm.gender} onChange={e=>setEditForm({...editForm,gender:e.target.value})}>
                      <option value="UNKNOWN">Inconnu</option><option value="MALE">Homme</option>
                      <option value="FEMALE">Femme</option><option value="OTHER">Autre</option>
                    </select>
                  </div>
                  <EditField label="Date naissance" value={editForm.birthDate} onChange={v=>setEditForm({...editForm,birthDate:v})} type="date"/>
                  <EditField label="Lieu naissance" value={editForm.birthPlace} onChange={v=>setEditForm({...editForm,birthPlace:v})}/>
                  <EditField label="Date décès" value={editForm.deathDate} onChange={v=>setEditForm({...editForm,deathDate:v})} type="date"/>
                  <EditField label="Lieu décès" value={editForm.deathPlace} onChange={v=>setEditForm({...editForm,deathPlace:v})}/>
                  <div className="tpp-edit-field">
                    <label>Notes</label>
                    <textarea value={editForm.notes} onChange={e=>setEditForm({...editForm,notes:e.target.value})} rows={3}/>
                  </div>
                  <div className="tpp-edit-actions">
                    <button className="tpp-btn" onClick={()=>setEditing(false)} disabled={saving}>Annuler</button>
                    <button className="tpp-btn tpp-btn-accent" onClick={handleSave} disabled={saving}>{saving?'...':'Sauvegarder'}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab==='DOCS'&&(
            <div className="tpp-docs">
              {/* Upload */}
              {isAdmin&&(
                <div className="tpp-upload">
                  <div className="tpp-upload-row">
                    <select value={uploadCat} onChange={e=>setUploadCat(e.target.value)} className="tpp-select-sm">
                      {Object.entries(CAT_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                    </select>
                    <input className="tpp-input-sm" placeholder="Description..." value={uploadDesc} onChange={e=>setUploadDesc(e.target.value)}/>
                  </div>
                  <label className="tpp-btn tpp-btn-accent" style={{cursor:'pointer',textAlign:'center'}}>
                    {uploading?'Envoi...':'📎 Ajouter document'}
                    <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx" onChange={handleUploadDoc} style={{display:'none'}} disabled={uploading}/>
                  </label>
                </div>
              )}

              {/* Person docs */}
              <div className="tpp-sub-title">📄 Documents personnels ({docs.length})</div>
              {docs.length===0?<div className="tpp-empty">Aucun document</div>:
                <div className="tpp-doc-grid">
                  {docs.map(d=><DocCard key={d.id} doc={d} canDelete={isAdmin} onDelete={handleDeleteDoc}/>)}
                </div>
              }

              {/* Union docs */}
              {unions.map((u:any)=>{
                const udocs=unionDocs[u.id]||[];
                const partner=u.partner1Id===personId?u.partner2:u.partner1;
                return(
                  <div key={u.id}>
                    <div className="tpp-sub-title" style={{marginTop:12}}>💍 Documents couple — {dn(partner)||'Partenaire'} ({udocs.length})</div>
                    {udocs.length===0?<div className="tpp-empty">Aucun document de couple</div>:
                      <div className="tpp-doc-grid">
                        {udocs.map(d=><DocCard key={d.id} doc={d} canDelete={isAdmin} onDelete={handleDeleteDoc}/>)}
                      </div>
                    }
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
    <style>{`
      .tpp{position:absolute;top:var(--space-3);right:var(--space-3);bottom:var(--space-3);width:min(360px,calc(100%-2*var(--space-3)));z-index:14;}
      .tpp-inner{height:100%;overflow-y:auto;display:flex;flex-direction:column;background:rgba(14,17,23,0.95);border:1px solid hsla(220,20%,28%,0.5);border-radius:16px;box-shadow:0 8px 32px hsla(220,40%,4%,0.5);backdrop-filter:blur(16px);}
      .tpp-inner::-webkit-scrollbar{width:6px;}.tpp-inner::-webkit-scrollbar-thumb{background:hsla(200,15%,50%,0.3);border-radius:99px;}
      .tpp-avatar-section{display:flex;flex-direction:column;align-items:center;padding:20px 16px 12px;gap:8px;border-bottom:1px solid hsla(220,20%,28%,0.4);}
      .tpp-avatar{width:72px;height:72px;border-radius:50%;border:3px solid;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;cursor:pointer;transition:transform 200ms ease;}
      .tpp-avatar:hover{transform:scale(1.05);}
      .tpp-avatar-img{width:100%;height:100%;object-fit:cover;}
      .tpp-avatar-initials{font-size:1.4rem;font-weight:700;color:var(--color-text-primary);opacity:0.8;}
      .tpp-avatar-overlay{position:absolute;inset:0;background:hsla(0,0%,0%,0.5);display:flex;align-items:center;justify-content:center;font-size:1.2rem;opacity:0;transition:opacity 200ms ease;}
      .tpp-avatar:hover .tpp-avatar-overlay{opacity:1;}
      .tpp-name{font-size:1rem;font-weight:700;color:var(--color-text-primary);text-align:center;margin:0;}
      .tpp-meta{font-size:0.72rem;color:var(--color-text-secondary);display:flex;gap:6px;flex-wrap:wrap;justify-content:center;}
      .tpp-actions{display:flex;gap:4px;margin-top:4px;}
      .tpp-btn{padding:5px 10px;border-radius:7px;border:1px solid hsla(220,20%,28%,0.5);background:hsla(220,20%,18%,0.6);color:var(--color-text-secondary);font-size:0.7rem;cursor:pointer;transition:all 120ms ease;white-space:nowrap;}
      .tpp-btn:hover:not(:disabled){background:hsla(220,20%,24%,0.8);color:var(--color-text-primary);}
      .tpp-btn:disabled{opacity:0.4;}
      .tpp-btn-accent{background:hsla(200,80%,50%,0.15);border-color:hsla(200,80%,50%,0.3);color:hsl(200,80%,65%);}
      .tpp-btn-accent:hover:not(:disabled){background:hsla(200,80%,50%,0.25);}
      .tpp-btn-danger{background:hsla(0,70%,50%,0.1);border-color:hsla(0,70%,50%,0.3);color:hsl(0,70%,65%);}
      .tpp-btn-danger:hover:not(:disabled){background:hsla(0,70%,50%,0.2);}
      .tpp-btn-close{width:28px;padding:5px;text-align:center;}
      .tpp-tabs{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid hsla(220,20%,28%,0.3);}
      .tpp-tab{padding:10px;border:none;background:transparent;color:var(--color-text-muted);font-size:0.72rem;font-weight:600;cursor:pointer;transition:all 150ms ease;border-bottom:2px solid transparent;}
      .tpp-tab:hover{color:var(--color-text-secondary);}
      .tpp-tab-active{color:hsl(200,80%,65%);border-bottom-color:hsl(200,80%,65%);}
      .tpp-content{flex:1;overflow-y:auto;padding:12px;}
      .tpp-content::-webkit-scrollbar{width:6px;}.tpp-content::-webkit-scrollbar-thumb{background:hsla(200,15%,50%,0.3);border-radius:99px;}
      .tpp-fields{display:flex;flex-direction:column;gap:6px;}
      .tpp-field{padding:6px 10px;border-radius:8px;background:hsla(220,20%,16%,0.5);border:1px solid hsla(220,20%,28%,0.2);}
      .tpp-field-label{font-size:0.6rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;}
      .tpp-field-value{font-size:0.78rem;color:var(--color-text-primary);margin-top:2px;}
      .tpp-sub-section{margin-top:8px;}
      .tpp-sub-title{font-size:0.68rem;font-weight:600;color:var(--color-text-secondary);margin-bottom:6px;}
      .tpp-union-card{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-radius:8px;background:hsla(220,20%,16%,0.5);border:1px solid hsla(220,20%,28%,0.2);font-size:0.74rem;color:var(--color-text-primary);margin-bottom:4px;}
      .tpp-badge{font-size:0.6rem;padding:2px 8px;border-radius:99px;background:hsla(45,80%,50%,0.12);color:hsl(45,80%,65%);font-weight:600;}
      .tpp-admin-actions{display:flex;gap:6px;margin-top:10px;}
      .tpp-edit-form{display:flex;flex-direction:column;gap:8px;}
      .tpp-edit-field{display:flex;flex-direction:column;gap:3px;}
      .tpp-edit-field label{font-size:0.62rem;color:var(--color-text-muted);font-weight:600;text-transform:uppercase;}
      .tpp-edit-field input,.tpp-edit-field select,.tpp-edit-field textarea{padding:7px 10px;border-radius:7px;border:1px solid hsla(220,20%,28%,0.5);background:hsla(220,20%,12%,0.7);color:var(--color-text-primary);font-size:0.76rem;outline:none;font-family:inherit;resize:vertical;}
      .tpp-edit-field input:focus,.tpp-edit-field select:focus,.tpp-edit-field textarea:focus{border-color:hsl(200,80%,50%);}
      .tpp-edit-actions{display:flex;gap:6px;justify-content:flex-end;margin-top:4px;}
      .tpp-docs{display:flex;flex-direction:column;gap:8px;}
      .tpp-upload{display:flex;flex-direction:column;gap:6px;padding:10px;border-radius:10px;background:hsla(220,20%,16%,0.5);border:1px solid hsla(220,20%,28%,0.3);margin-bottom:6px;}
      .tpp-upload-row{display:flex;gap:6px;}
      .tpp-select-sm,.tpp-input-sm{padding:5px 8px;border-radius:6px;border:1px solid hsla(220,20%,28%,0.5);background:hsla(220,20%,12%,0.7);color:var(--color-text-primary);font-size:0.68rem;outline:none;flex:1;}
      .tpp-empty{font-size:0.72rem;color:var(--color-text-muted);padding:8px 0;}
      .tpp-doc-grid{display:grid;gap:6px;}
      .tpp-doc-card{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:hsla(220,20%,16%,0.5);border:1px solid hsla(220,20%,28%,0.2);}
      .tpp-doc-thumb{width:40px;height:40px;border-radius:6px;object-fit:cover;background:hsla(220,20%,22%,0.5);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;overflow:hidden;}
      .tpp-doc-info{flex:1;min-width:0;}
      .tpp-doc-name{font-size:0.72rem;font-weight:600;color:var(--color-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .tpp-doc-cat{font-size:0.6rem;color:var(--color-text-muted);}
      .tpp-doc-actions{display:flex;gap:4px;}
      @media(max-width:900px){.tpp{left:var(--space-2);right:var(--space-2);width:auto;}}
    `}</style>
  </>);
}

function Field({label,value}:{label:string;value:string|null}){
  return(<div className="tpp-field"><div className="tpp-field-label">{label}</div><div className="tpp-field-value">{value||'—'}</div></div>);
}

function EditField({label,value,onChange,type='text'}:{label:string;value:string;onChange:(v:string)=>void;type?:string}){
  return(<div className="tpp-edit-field"><label>{label}</label><input type={type} value={value} onChange={e=>onChange(e.target.value)}/></div>);
}

function DocCard({doc,canDelete,onDelete}:{doc:any;canDelete:boolean;onDelete:(id:string)=>void}){
  const isImg=doc.mimeType?.startsWith('image/');
  return(
    <div className="tpp-doc-card">
      <div className="tpp-doc-thumb">
        {isImg?<img src={documentApi.viewUrl(doc.id)} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:'📄'}
      </div>
      <div className="tpp-doc-info">
        <div className="tpp-doc-name">{doc.filename}</div>
        <div className="tpp-doc-cat">{CAT_LABELS[doc.category]||doc.category}</div>
      </div>
      <div className="tpp-doc-actions">
        <a href={documentApi.downloadUrl(doc.id)} className="tpp-btn" style={{fontSize:'0.62rem',padding:'3px 6px'}}>⬇</a>
        {canDelete&&<button className="tpp-btn tpp-btn-danger" style={{fontSize:'0.62rem',padding:'3px 6px'}} onClick={()=>onDelete(doc.id)}>✕</button>}
      </div>
    </div>
  );
}
