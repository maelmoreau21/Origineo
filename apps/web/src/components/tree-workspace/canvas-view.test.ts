import { describe, expect, it } from 'vitest';
import {
  centerViewOnPoint,
  fitViewToBounds,
  zoomViewAroundViewportCenter,
} from './canvas-view';

describe('canvas view helpers', () => {
  it('centers a target point in the viewport', () => {
    const view = centerViewOnPoint({ x: 400, y: 240 }, { width: 1200, height: 800 }, 1);

    expect(view).toEqual({ x: 200, y: 160, scale: 1 });
  });

  it('fits visible bounds with padding', () => {
    const view = fitViewToBounds(
      { width: 1600, height: 900 },
      { width: 1200, height: 800 },
      { padding: 100 },
    );

    expect(view.scale).toBeCloseTo(0.625, 3);
    expect(view.x).toBeCloseTo(100, 1);
    expect(view.y).toBeCloseTo(118.75, 1);
  });

  it('zooms around the current viewport center', () => {
    const viewport = { width: 1000, height: 700 };
    const view = centerViewOnPoint({ x: 300, y: 220 }, viewport, 1);
    const zoomed = zoomViewAroundViewportCenter(view, viewport, 1.4);

    expect((viewport.width / 2 - zoomed.x) / zoomed.scale).toBeCloseTo(300, 3);
    expect((viewport.height / 2 - zoomed.y) / zoomed.scale).toBeCloseTo(220, 3);
  });
});
