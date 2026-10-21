import { AssetDef, Dir, FloorDef, Variant, WallStyleDef } from './types';

const assets = new Map<string, AssetDef>();
const floors = new Map<string, FloorDef>();
const walls = new Map<string, WallStyleDef>();
const variants = new Map<string, Variant>();

export function defineAsset(def: AssetDef): AssetDef {
  if (assets.has(def.id)) {
    throw new Error(`Duplicate asset id ${def.id}`);
  }
  assets.set(def.id, def);
  return def;
}

export function defineFloor(def: FloorDef): FloorDef {
  if (floors.has(def.id)) {
    throw new Error(`Duplicate floor id ${def.id}`);
  }
  floors.set(def.id, def);
  return def;
}

export function defineWallStyle(def: WallStyleDef): WallStyleDef {
  if (walls.has(def.id)) {
    throw new Error(`Duplicate wall style id ${def.id}`);
  }
  walls.set(def.id, def);
  return def;
}

export function asset(id: string): AssetDef | undefined {
  return assets.get(id);
}

/** The built variant for a facing (falls back to the asset's first facing). Cached. */
export function variant(id: string, facing: Dir): Variant | undefined {
  const def = assets.get(id);
  if (!def) {
    return undefined;
  }
  const f = def.facings.includes(facing) ? facing : def.facings[0];
  const key = `${id}|${f}`;
  let v = variants.get(key);
  if (!v) {
    v = def.build(f);
    variants.set(key, v);
  }
  return v;
}

export function allAssets(): AssetDef[] {
  return [...assets.values()];
}

export function floor(id: string): FloorDef | undefined {
  return floors.get(id);
}

export function allFloors(): FloorDef[] {
  return [...floors.values()];
}

export function wallStyle(id: string): WallStyleDef | undefined {
  return walls.get(id);
}

export function allWallStyles(): WallStyleDef[] {
  return [...walls.values()];
}

/** Assets interchangeable with `id` (same group), for the editor's swap list. */
export function swapsFor(id: string): AssetDef[] {
  const def = assets.get(id);
  return def ? [...assets.values()].filter((a) => a.group === def.group && a.id !== id) : [];
}
