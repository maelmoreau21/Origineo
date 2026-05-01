export type CanvasView = {
  x: number;
  y: number;
  scale: number;
};

export type CanvasPoint = {
  x: number;
  y: number;
};

export type CanvasSize = {
  width: number;
  height: number;
};

const MIN_SCALE = 0.3;
const MAX_SCALE = 1.8;

export function clampCanvasScale(scale: number) {
  if (!Number.isFinite(scale)) return 0.9;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

export function centerViewOnPoint(
  point: CanvasPoint,
  viewport: CanvasSize,
  scale: number,
): CanvasView {
  const nextScale = clampCanvasScale(scale);
  return {
    x: viewport.width / 2 - point.x * nextScale,
    y: viewport.height / 2 - point.y * nextScale,
    scale: nextScale,
  };
}

export function fitViewToBounds(
  bounds: CanvasSize,
  viewport: CanvasSize,
  options: { padding?: number; maxScale?: number } = {},
): CanvasView {
  const padding = options.padding ?? 96;
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const maxScale = options.maxScale ?? 1;
  const nextScale = clampCanvasScale(
    Math.min(
      availableWidth / Math.max(1, bounds.width),
      availableHeight / Math.max(1, bounds.height),
      maxScale,
    ),
  );

  return {
    x: (viewport.width - bounds.width * nextScale) / 2,
    y: (viewport.height - bounds.height * nextScale) / 2,
    scale: nextScale,
  };
}

export function zoomViewAroundViewportCenter(
  view: CanvasView,
  viewport: CanvasSize,
  scale: number,
): CanvasView {
  const centerPoint = {
    x: (viewport.width / 2 - view.x) / view.scale,
    y: (viewport.height / 2 - view.y) / view.scale,
  };

  return centerViewOnPoint(centerPoint, viewport, scale);
}
