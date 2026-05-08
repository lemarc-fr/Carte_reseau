import { createRoot, Root } from 'react-dom/client';
import React from 'react';

/**
 * A MapLibre IControl that renders a React element into a DOM container.
 * Call `setContent(element)` to update the rendered content reactively.
 */
export class ReactControl {
  private _container: HTMLDivElement;
  private _root: Root | null = null;
  private _currentElement: React.ReactElement;

  constructor(element: React.ReactElement) {
    this._currentElement = element;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group'; // ← add this
  }

  onAdd(): HTMLElement {
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this._root = createRoot(this._container);
    this._root.render(this._currentElement);
    return this._container;
  }

  onRemove(): void {
    const root = this._root;
    this._root = null;
    setTimeout(() => root?.unmount(), 0);
  }

  setContent(element: React.ReactElement): void {
    this._currentElement = element;
    this._root?.render(element);
  }
}
