/*
Copyright 2020 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { TagID } from "./models";

const TILE_HEIGHT_PX = 44;

interface ISerializedListLayout {
    numTiles: number;
    showPreviews: boolean;
}

export class ListLayout {
    private _n = 0;
    private _previews = false;

    constructor(public readonly tagId: TagID) {
        const serialized = localStorage.getItem(this.key);
        if (serialized) {
            // We don't use the setters as they cause writes.
            const parsed = <ISerializedListLayout>JSON.parse(serialized);
            this._n = parsed.numTiles;
            this._previews = parsed.showPreviews;
        }
    }

    public get showPreviews(): boolean {
        return this._previews;
    }

    public set showPreviews(v: boolean) {
        this._previews = v;
        this.save();
    }

    public get tileHeight(): number {
        return TILE_HEIGHT_PX;
    }

    private get key(): string {
        return `mx_sublist_layout_${this.tagId}_boxed`;
    }

    public get visibleTiles(): number {
        return Math.max(this._n, this.minVisibleTiles);
    }

    public set visibleTiles(v: number) {
        this._n = v;
        this.save();
    }

    public get minVisibleTiles(): number {
        // the .65 comes from the CSS where the show more button is
        // mathematically 65% of a tile when floating.
        return 4.65;
    }

    public calculateTilesToPixelsMin(maxTiles: number, n: number, possiblePadding: number): number {
        // Only apply the padding if we're about to use maxTiles as we need to
        // plan for the padding. If we're using n, the padding is already accounted
        // for by the resizing stuff.
        let padding = 0;
        if (maxTiles < n) {
            padding = possiblePadding;
        }
        return this.tilesToPixels(Math.min(maxTiles, n)) + padding;
    }

    public tilesToPixelsWithPadding(n: number, padding: number): number {
        return this.tilesToPixels(n) + padding;
    }

    public tilesToPixels(n: number): number {
        return n * this.tileHeight;
    }

    public pixelsToTiles(px: number): number {
        return px / this.tileHeight;
    }

    private save() {
        localStorage.setItem(this.key, JSON.stringify(this.serialize()));
    }

    private serialize(): ISerializedListLayout {
        return {
            numTiles: this.visibleTiles,
            showPreviews: this.showPreviews,
        };
    }
}
