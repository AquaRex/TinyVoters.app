/// <summary>
/// Builds the game's map into this object's <see cref="BlockGrid"/>: a village in the middle (a market, houses of
/// several kinds along winding paths, a farm), a river with a bridge, and outskirts of meadows with ponds, forests
/// and hills, ringed by a forested cliff plateau that keeps the player in.
/// </summary>
/// <remarks>
/// The map is fixed: the village is laid out by hand below, and everything else follows from <see cref="Seed"/>, so
/// the same seed always gives the same world. Press Generate in the inspector to (re)build it and save the scene;
/// the game then loads exactly that world, edits made in the editor included.
/// </remarks>
public class WorldGenerator : Behaviour
{
    public int Seed = 7;
    /// <summary>Width and depth of the map in blocks (a multiple of 16), centred on the origin.</summary>
    public int MapSize = 128;
    /// <summary>Build the map when play starts instead of using the saved one (slower to start).</summary>
    public bool GenerateOnStart;
    /// <summary>Chunks further than this from the player have their objects hidden, to keep big maps fast.</summary>
    [Range(1, 8)] public int ViewRadius = 3;

    public Prefab? House, Cottage, LampPost, Crates, CratePair, HayBale, Barrel, Well, Fence, Bridge;
    public Prefab? FlowerRed, FlowerYellow, TallGrass, Crop, Villager, Chicken, Cow;
    public Prefab? LogCabin, PumpkinStall, WeaponStall, PotionStall, Chest, Forge, Mushroom, Boulder, Bush, Pumpkin, LilyPad, FlowerBlue, Carrots, Farmer;
    /// <summary>Put in the market square when the map is built.</summary>
    public Transform? Player;

    [SerializeField, HideInInspector] GameObject? _generated;

    const int Ground = 3;           // the cell row whose top is world y = 0
    const float VillageRadius = 32f;
    const int RimWidth = 13;         // the cliff plateau around the edge

    /// <summary>A house: <see cref="W"/> and <see cref="D"/> are its own width and depth; it is turned by
    /// <see cref="Yaw"/> (a multiple of 90) so its door faces a path.</summary>
    readonly record struct Plot(Prefab? Prefab, int X, int Z, int W, int D, float Yaw)
    {
        bool Turned => MathF.Abs(Yaw) == 90f;
        /// <summary>Size along world x and z.</summary>
        public int SizeX => Turned ? D : W;
        public int SizeZ => Turned ? W : D;
        /// <summary>The world direction the door faces.</summary>
        public (int X, int Z) Front => Yaw switch { 90f => (1, 0), -90f => (-1, 0), 180f => (0, -1), _ => (0, 1) };

        /// <summary>A point given in the house's own frame (x right, z out of the door), in the world.</summary>
        public Vector2 World(float x, float z)
        {
            float r = Yaw * MathX.Deg2Rad, c = MathF.Cos(r), s = MathF.Sin(r);
            return new Vector2(X + x * c + z * s, Z - x * s + z * c);
        }
    }
    enum Biome { Meadow, Oak, Birch, Pine, Rocky }
    readonly record struct Rect(int X0, int Z0, int X1, int Z1)
    {
        public bool Contains(int x, int z) => x >= X0 && x < X1 && z >= Z0 && z < Z1;
    }
    /// <summary>A hand-placed object; <see cref="Y"/> is above the ground.</summary>
    readonly record struct Landmark(Prefab? Prefab, float X, float Z, float Yaw = 0f, float Y = 0f);

    BlockGrid? _grid;
    BlockPalette _palette = null!;
    int _seed;
    readonly Dictionary<(int, int), GameObject> _chunkRoots = [];
    readonly List<Plot> _plots = [];
    readonly List<Vector2[]> _paths = [];
    readonly List<Rect> _reserved = [];
    readonly List<Landmark> _landmarks = [];
    Rect _farmland;
    byte _grass, _forestGrass, _dirt, _stone, _water, _sand, _path, _gravel, _farmlandBlock, _log, _leaves;
    byte _birchLog, _birchLeaves, _pineLeaves, _rock;

    int HalfSize => MapSize / 2;

    protected override void Start()
    {
        if (GenerateOnStart) Generate();
        else if (Begin()) Resume();
    }

    /// <summary>Builds the whole map from <see cref="Seed"/>, replacing what was there.</summary>
    [Button]
    public void Generate()
    {
        if (!Begin() || Scene is not { } scene) return;
        _grid!.Clear();
        if (_generated is { IsDestroyed: false }) scene.DestroyImmediate(_generated);
        _generated = scene.CreateGameObject("Generated");
        _chunkRoots.Clear();
        int chunks = HalfSize / BlockGrid.ChunkSize;
        for (int cz = -chunks; cz < chunks; cz++)
            for (int cx = -chunks; cx < chunks; cx++) GenerateChunk(cx, cz);
        if (Player is not null)
        {
            Player.Position = new Vector3(0.5f, 0f, 1.5f);
            Player.GetComponent<CharacterBody>()?.SnapToGround();
        }
        Debug.Log($"Built the map from seed {_seed}.");
    }

    /// <summary>Hides the objects of chunks far from the player (they still exist, and the blocks still draw).</summary>
    protected override void Update()
    {
        if (Player is null) return;
        var (px, pz) = BlockGrid.ChunkOf((int)MathF.Floor(Player.Position.X), (int)MathF.Floor(Player.Position.Z));
        foreach (var ((x, z), root) in _chunkRoots)
        {
            bool near = Math.Max(Math.Abs(x - px), Math.Abs(z - pz)) <= ViewRadius;
            if (root.ActiveSelf != near) root.ActiveSelf = near;
        }
    }

    bool Begin()
    {
        if (GetComponent<BlockGrid>() is not { Palette: { } palette } grid)
        {
            Debug.LogWarning("WorldGenerator needs a Block Grid with a palette on the same object.");
            return false;
        }
        (_grid, _palette, _seed) = (grid, palette, Seed);
        Transform.Position = new Vector3(0f, -Ground - 1, 0f); // cell (x, Ground, z) has its top at world (x, 0, z)
        (_grass, _forestGrass, _dirt, _stone) = (BlockId("Grass"), BlockId("Forest Grass"), BlockId("Dirt"), BlockId("Stone"));
        (_water, _sand, _path, _gravel) = (BlockId("Water"), BlockId("Sand"), BlockId("Path"), BlockId("Gravel"));
        (_farmlandBlock, _log, _leaves) = (BlockId("Farmland"), BlockId("Log"), BlockId("Leaves"));
        (_birchLog, _birchLeaves, _pineLeaves, _rock) = (BlockId("Birch Log"), BlockId("Birch Leaves"), BlockId("Pine Leaves"), BlockId("Rock"));
        PlanVillage();
        return true;
    }

    /// <summary>Picks up the saved map: its chunks' object groups are found by name.</summary>
    void Resume()
    {
        if (_generated is null) return;
        foreach (var child in _generated.Transform.Children)
            if (child.Name.Split(' ', ',') is [_, var x, var z] && int.TryParse(x, out int cx) && int.TryParse(z, out int cz))
                _chunkRoots[(cx, cz)] = child.GameObject;
    }

    // ---- The village, laid out by hand ----

    /// <summary>
    /// The village plan. Paths wind between points; houses stand beside them at their own spacing and turned to face
    /// them, so nothing lines up in rows. The market square is in the middle, the river just east with a bridge,
    /// the farm to the south-west.
    /// </summary>
    void PlanVillage()
    {
        _paths.Clear();
        _plots.Clear();
        _reserved.Clear();
        _landmarks.Clear();
        _paths.AddRange([
            [new(-50, 7), new(-38, 5), new(-30, 3), new(-16, 0), new(0, 0), new(10, 0), new(20, 2), new(30, -4), new(50, -9)], // through the village
            [new(0, 0), new(-1, -10), new(-5, -20), new(-4, -34), new(-10, -50)],                                           // north
            [new(-2, 1), new(-7, 12), new(-5, 24), new(2, 36), new(4, 50)],                                                // south
            [new(-16, 0), new(-19, -10), new(-12, -19), new(-5, -20)],                                                     // a loop to the north-west
            [new(20, 2), new(24, 12), new(21, 26)],                                                                        // east of the river
            [new(-30, 3), new(-27, 15)],                                                                                   // to the farm
        ]);

        // Ground kept clear for the market square and the farm (houses check against it).
        const int fx = -36, fz = 18;
        _reserved.Add(new Rect(-11, -6, 8, -1));
        _reserved.Add(new Rect(-9, 2, 3, 8));
        _reserved.Add(new Rect(fx - 2, fz - 2, fx + 12, fz + 18));

        // Houses: kind, position, and which way the door faces (0 south, 180 north, 90 east, -90 west).
        (char Kind, int X, int Z, float Yaw)[] houses = [
            ('H', -25, -7, 0f), ('C', -37, -3, 0f), ('L', -40, 11, 180f), ('H', -15, 10, 180f), ('C', -8, -12, 90f),
            ('H', 6, -13, -90f), ('L', -14, -28, 90f), ('C', 2, -27, -90f), ('H', -13, 22, 90f), ('C', 1, 18, -90f),
            ('L', -6, 34, 90f), ('H', 8, 32, -90f), ('C', 26, -9, 0f), ('H', 33, 4, 180f), ('L', 30, 18, -90f), ('C', 40, -16, 0f),
        ];
        foreach (var (kind, x, z, yaw) in houses)
        {
            var (prefab, w, d) = kind switch { 'C' => (Cottage, 6, 5), 'L' => (LogCabin, 6, 6), _ => (House, 7, 6) };
            var plot = new Plot(prefab, x, z, w, d, yaw);
            if (Usable(plot)) _plots.Add(plot);
            else Debug.LogWarning($"WorldGenerator: the house at {x},{z} overlaps a path, the river or the market; skipped.");
        }

        // The market: stalls shoulder to shoulder north of the square, the forge, well and chest across it.
        _landmarks.AddRange([
            new(PumpkinStall, -6.8f, -4.1f), new(WeaponStall, -3.3f, -4.1f), new(PotionStall, 3.6f, -4.1f), new(Crates, -9.4f, -3.2f),
            new(CratePair, 6.2f, -3f), new(Barrel, 2f, -2.6f), new(Villager, -4.5f, -2.3f), new(Villager, 4.8f, -2.4f),
            new(Chest, 1.6f, 3f), new(Forge, -6.4f, 3.4f), new(Farmer, 3.3f, 3.1f), new(Well, -1.5f, 5f),
            new(Bridge, RiverX(1) + 0.5f, 1f),
        ]);

        // The farm: fields of wheat and carrots, a pasture with cows, hay bales and chickens.
        _farmland = new Rect(fx, fz, fx + 10, fz + 7);
        for (int r = 0; r < 5; r++)
            for (int c = 0; c < 10; c++) _landmarks.Add(new(r % 2 == 0 ? Crop : Carrots, fx + 0.5f + c, fz + 0.6f + r * 1.4f, Y: 0.03f));
        FenceRect(fx - 0.2f, fz - 0.6f, fx + 10.2f, fz + 7.6f);
        FenceRect(fx + 0.5f, fz + 8.4f, fx + 10.5f, fz + 16.4f);
        _landmarks.AddRange([new(Cow, fx + 3.5f, fz + 11f), new(Cow, fx + 7f, fz + 13.5f), new(HayBale, fx + 11.2f, fz + 2f),
                             new(HayBale, fx + 11.3f, fz + 3.1f), new(Chicken, fx + 11f, fz + 6f), new(Chicken, fx + 11.5f, fz + 9f)]);

        // Lamp posts along the village paths, alternating sides, wherever there is room.
        foreach (var path in _paths)
        {
            float walked = 4f;
            int side = 1;
            for (int i = 0; i + 1 < path.Length; i++)
            {
                var (a, b) = (path[i], path[i + 1]);
                float length = Vector2.Distance(a, b);
                var along = (b - a) / length;
                for (; walked < length; walked += 9f, side = -side)
                {
                    var at = a + along * walked + new Vector2(-along.Y, along.X) * 2.6f * side;
                    int cx = (int)MathF.Floor(at.X), cz = (int)MathF.Floor(at.Y);
                    if (at.Length() < VillageRadius && !Taken(cx, cz)) _landmarks.Add(new(LampPost, at.X, at.Y));
                }
                walked -= length;
            }
        }
    }

    void FenceRect(float x0, float z0, float x1, float z1)
    {
        for (float x = x0 + 2f; x < x1; x += 4f) _landmarks.AddRange([new(Fence, x, z0), new(Fence, x, z1)]);
        for (float z = z0 + 2f; z < z1; z += 4f) _landmarks.AddRange([new(Fence, x0, z, 90f), new(Fence, x1, z, 90f)]);
    }

    /// <summary>A house fits where it stands on flat ground clear of paths, water and the market.</summary>
    bool Usable(Plot p)
    {
        for (int x = (int)MathF.Floor(p.X - p.SizeX / 2f); x < (int)MathF.Ceiling(p.X + p.SizeX / 2f); x++)
            for (int z = (int)MathF.Floor(p.Z - p.SizeZ / 2f); z < (int)MathF.Ceiling(p.Z + p.SizeZ / 2f); z++)
                if (IsRoad(x, z) || Math.Abs(x - RiverX(z)) <= 2 || _reserved.Exists(r => r.Contains(x, z))) return false;
        return true;
    }

    Plot? PlotAt(int wx, int wz) => _plots.Find(p => Covers(p, wx, wz)) is { Prefab: not null } plot ? plot : null;

    /// <summary>The house's footprint with a one-block margin, and a small yard on the door side.</summary>
    static bool Covers(Plot p, int wx, int wz)
    {
        int x0 = p.X - p.SizeX / 2 - 1, x1 = p.X + (p.SizeX + 1) / 2 + 1, z0 = p.Z - p.SizeZ / 2 - 1, z1 = p.Z + (p.SizeZ + 1) / 2 + 1;
        var (fx, fz) = p.Front;
        if (fx > 0) x1 += 2; else if (fx < 0) x0 -= 2;
        if (fz > 0) z1 += 2; else if (fz < 0) z0 -= 2;
        return wx >= x0 && wx < x1 && wz >= z0 && wz < z1;
    }

    // ---- The land: pure functions of position ----

    /// <summary>Blocks from the map's edge (0 at the edge), with a ragged line so the cliff isn't ruler-straight.</summary>
    float EdgeDistance(int wx, int wz) =>
        HalfSize - Math.Max(MathF.Abs(wx + 0.5f), MathF.Abs(wz + 0.5f)) + (Noise(wx / 5f, wz / 5f, 81) - 0.5f) * 4f;

    bool OnRim(int wx, int wz) => EdgeDistance(wx, wz) < RimWidth;

    /// <summary>The river runs north to south just east of the market, gently meandering, and springs from the rim.</summary>
    int RiverX(int wz) => 14 + (int)MathF.Round(3f * MathF.Sin(wz / 14f) + (Noise(0f, wz / 30f, 61) - 0.5f) * 8f * Math.Clamp((MathF.Abs(wz) - 20f) / 20f, 0f, 1f));

    bool IsRiver(int wx, int wz) => Math.Abs(wx - RiverX(wz)) <= 1 && !OnRim(wx, wz);

    /// <summary>Distance to the nearest path's centre line.</summary>
    float PathDistance(float x, float z)
    {
        var p = new Vector2(x, z);
        float best = float.MaxValue;
        foreach (var path in _paths)
            for (int i = 0; i + 1 < path.Length; i++)
            {
                var (a, b) = (path[i], path[i + 1]);
                var ab = b - a;
                float t = Math.Clamp(Vector2.Dot(p - a, ab) / ab.LengthSquared(), 0f, 1f);
                best = MathF.Min(best, Vector2.Distance(p, a + ab * t));
            }
        return best;
    }

    /// <summary>Paths are about 3 blocks wide, with a ragged edge.</summary>
    bool IsRoad(int wx, int wz)
    {
        if (OnRim(wx, wz)) return false;
        float d = PathDistance(wx + 0.5f, wz + 0.5f);
        return d < 1.3f || (d < 2f && Hash(wx, wz, 13) < 0.35f);
    }

    /// <summary>The top cell row of a column: flat in the village, rolling hills beyond, and the high rim.</summary>
    int Level(int wx, int wz)
    {
        if (OnRim(wx, wz)) return _grid!.Height - 4;
        if (IsRiver(wx, wz) || IsPond(wx, wz)) return Ground;
        float fromCentre = MathF.Sqrt(wx * wx + wz * wz);
        if (fromCentre < VillageRadius || _reserved.Exists(r => r.Contains(wx, wz)) || PlotAt(wx, wz) is not null) return Ground;
        // Hills rise in steps away from the village, the paths and the river, and swell towards the rim.
        float room = MathF.Min(PathDistance(wx, wz) - 3f, Math.Abs(wx - RiverX(wz)) - 3f) / 3f;
        int hills = Math.Clamp((int)(Noise(wx / 12f, wz / 12f, 7) * 5f) - 1, 0, 3) + (EdgeDistance(wx, wz) < RimWidth + 8 ? 1 : 0);
        int rise = Math.Clamp((int)MathF.Min((fromCentre - VillageRadius) / 4f, room), 0, hills);
        return Math.Min(Ground + rise, _grid!.Height - 5);
    }

    float GroundY(float wx, float wz) => Level((int)MathF.Floor(wx), (int)MathF.Floor(wz)) - Ground;

    static bool InVillage(int wx, int wz) => wx * wx + wz * wz < VillageRadius * VillageRadius;

    /// <summary>Biome patches tens of blocks across; the village is meadow and the rim is pine forest.</summary>
    Biome BiomeAt(int wx, int wz)
    {
        if (OnRim(wx, wz)) return Biome.Pine;
        if (InVillage(wx, wz)) return Biome.Meadow;
        float wild = Noise(wx / 9f, wz / 9f, 11), kind = Noise(wx / 25f, wz / 25f, 12);
        if (wild < 0.5f) return kind > 0.72f ? Biome.Rocky : Biome.Meadow;
        return kind < 0.4f ? Biome.Oak : kind < 0.6f ? Biome.Birch : Biome.Pine;
    }

    /// <summary>Round ponds here and there in the outer meadows.</summary>
    bool IsPond(int wx, int wz)
    {
        int gx = (int)MathF.Floor(wx / 24f), gz = (int)MathF.Floor(wz / 24f);
        if (Hash(gx, gz, 53) > 0.45f) return false;
        int cx = gx * 24 + 6 + (int)(Hash(gx, gz, 54) * 12), cz = gz * 24 + 6 + (int)(Hash(gx, gz, 55) * 12);
        float r = 2.2f + Hash(gx, gz, 56) * 1.8f, dx = wx - cx, dz = wz - cz;
        if (dx * dx + dz * dz > r * r || InVillage(cx, cz) || OnRim(cx, cz) || EdgeDistance(cx, cz) < RimWidth + 5) return false;
        return BiomeAt(cx, cz) == Biome.Meadow && PathDistance(cx, cz) > r + 4 && Math.Abs(cx - RiverX(cz)) > r + 4;
    }

    /// <summary>Anything built here (a path, the river bank, a house and its yard, the market) keeps trees and flowers away.</summary>
    bool Taken(int wx, int wz)
    {
        if (IsRoad(wx, wz) || (Math.Abs(wx - RiverX(wz)) <= 2 && !OnRim(wx, wz)) || IsPond(wx, wz)) return true;
        foreach (var rect in _reserved)
            if (rect.Contains(wx, wz)) return true;
        return PlotAt(wx, wz) is not null;
    }

    // ---- Building a chunk ----

    void GenerateChunk(int cx, int cz)
    {
        int x0 = cx * BlockGrid.ChunkSize, z0 = cz * BlockGrid.ChunkSize, size = BlockGrid.ChunkSize;
        for (int x = x0; x < x0 + size; x++)
            for (int z = z0; z < z0 + size; z++) Column(x, z);

        // Trees whose canopy reaches into this chunk, including ones rooted next door (only our cells are written).
        for (int gx = (int)MathF.Floor((x0 - 2) / 4f); gx <= (x0 + size + 2) / 4; gx++)
            for (int gz = (int)MathF.Floor((z0 - 2) / 4f); gz <= (z0 + size + 2) / 4; gz++)
                if (TreeAt(gx, gz) is var (tx, tz)) VoxelTree(tx, tz, x0, z0);

        var root = _chunkRoots[(cx, cz)] = Scene!.CreateGameObject($"Chunk {cx},{cz}", _generated!.Transform);
        Populate(root.Transform, x0, z0);
    }

    void Column(int wx, int wz)
    {
        if (Math.Max(Math.Abs(wx + 0.5f), Math.Abs(wz + 0.5f)) > HalfSize) return; // outside the map
        int top = Level(wx, wz);
        for (int y = 0; y < top; y++) _grid!.Set(wx, y, wz, y < top - 2 ? _stone : _dirt);
        _grid!.Set(wx, top, wz, Surface(wx, wz));
        if (IsRiver(wx, wz) || IsPond(wx, wz)) _grid.Set(wx, top - 1, wz, _sand);
    }

    byte Surface(int wx, int wz)
    {
        if (OnRim(wx, wz)) return _forestGrass;
        if (IsRiver(wx, wz) || IsPond(wx, wz)) return _water;
        if (wx >= -4 && wx < 1 && wz >= 3 && wz < 7) return _gravel; // the well square
        if (_farmland.Contains(wx, wz)) return _farmlandBlock;
        if (IsRoad(wx, wz)) return _path;
        if (Math.Abs(wx - RiverX(wz)) == 2 && Noise(0, wz / 5f, 21) > 0.55f) return _sand;
        if (Hash(wx, wz, 22) < 0.7f && (IsPond(wx + 1, wz) || IsPond(wx - 1, wz) || IsPond(wx, wz + 1) || IsPond(wx, wz - 1))) return _sand;
        var biome = BiomeAt(wx, wz);
        if (biome == Biome.Rocky && Noise(wx / 3f, wz / 3f, 23) > 0.55f) return _rock;
        return biome is Biome.Oak or Biome.Pine ? _forestGrass : _grass;
    }

    /// <summary>At most one tree per 4×4 cell group, at a random spot: dense in forests and on the rim, a few in the
    /// village and the meadows.</summary>
    (int X, int Z)? TreeAt(int gx, int gz)
    {
        int x = gx * 4 + (int)(Hash(gx, gz, 71) * 4), z = gz * 4 + (int)(Hash(gx, gz, 72) * 4);
        if (Math.Max(Math.Abs(x + 0.5f), Math.Abs(z + 0.5f)) > HalfSize - 2) return null;
        float chance = OnRim(x, z) ? 0.9f : BiomeAt(x, z) switch
        {
            Biome.Oak => 0.85f, Biome.Pine => 0.75f, Biome.Birch => 0.6f, Biome.Rocky => 0.12f,
            _ => InVillage(x, z) ? 0.12f : 0.08f,
        };
        if (Hash(gx, gz, 73) > chance) return null;
        int level = Level(x, z);
        for (int dx = -2; dx <= 2; dx++)
            for (int dz = -2; dz <= 2; dz++)
                if (Taken(x + dx, z + dz) || Level(x + dx, z + dz) > level) return null;
        return (x, z);
    }

    /// <summary>A tree of the biome's kind: a round oak, a slim birch, or a stepped pine (rocky hills grow pines).
    /// Only cells in this chunk are written, so trees on chunk borders are completed by both chunks.</summary>
    void VoxelTree(int wx, int wz, int x0, int z0)
    {
        bool Mine(int x, int z) => x >= x0 && x < x0 + BlockGrid.ChunkSize && z >= z0 && z < z0 + BlockGrid.ChunkSize;
        void Leaf(int x, int y, int z, byte leaves)
        {
            if (Mine(x, z) && _grid!.Get(x, y, z) == 0) _grid.Set(x, y, z, leaves);
        }
        var biome = BiomeAt(wx, wz);
        int baseY = Level(wx, wz) + 1;
        float size = Hash(wx, wz, 74);
        if (biome is Biome.Pine or Biome.Rocky)
        {
            int trunk = 4 + (int)(size * 2);
            if (Mine(wx, wz))
                for (int y = baseY; y < baseY + trunk; y++) _grid!.Set(wx, y, wz, _log);
            // Layers narrowing upwards: a diamond of radius 2, then 1, then 1, then a tip.
            int[] radii = [2, 1, 1, 0];
            for (int layer = 0; layer < radii.Length; layer++)
                for (int dx = -2; dx <= 2; dx++)
                    for (int dz = -2; dz <= 2; dz++)
                        if (Math.Abs(dx) + Math.Abs(dz) <= radii[layer] + (radii[layer] == 2 ? 1 : 0) && Math.Max(Math.Abs(dx), Math.Abs(dz)) <= radii[layer])
                            Leaf(wx + dx, baseY + trunk - 2 + layer, wz + dz, _pineLeaves);
            return;
        }
        bool birch = biome == Biome.Birch;
        int height = birch ? 3 + (int)(size * 2) : 2 + (int)(size * 2), radius = birch ? 1 : 2;
        if (Mine(wx, wz))
            for (int y = baseY; y < baseY + height; y++) _grid!.Set(wx, y, wz, birch ? _birchLog : _log);
        // One rounded mass with the same footprint on every layer (stepped oaks read as odd shadows from above).
        for (int dx = -radius; dx <= radius; dx++)
            for (int dz = -radius; dz <= radius; dz++)
            {
                bool corner = Math.Abs(dx) == radius && Math.Abs(dz) == radius;
                for (int y = baseY + height - 1; y <= baseY + height + (birch ? 1 : 0); y++)
                    if (!corner || (birch && y < baseY + height + 1)) Leaf(wx + dx, y, wz + dz, birch ? _birchLeaves : _leaves);
            }
    }

    /// <summary>The chunk's objects: the hand-placed ones, houses with their yards, plants and animals.</summary>
    void Populate(Transform parent, int x0, int z0)
    {
        bool Mine(float x, float z) => x >= x0 && x < x0 + BlockGrid.ChunkSize && z >= z0 && z < z0 + BlockGrid.ChunkSize;
        foreach (var l in _landmarks)
            if (Mine(l.X, l.Z)) Place(parent, l.Prefab, l.X, GroundY(l.X, l.Z) + l.Y, l.Z, l.Yaw);
        foreach (var plot in _plots)
            if (Mine(plot.X, plot.Z)) BuildHouse(parent, plot);
        for (int x = x0; x < x0 + BlockGrid.ChunkSize; x++)
            for (int z = z0; z < z0 + BlockGrid.ChunkSize; z++)
                if (Math.Max(Math.Abs(x + 0.5f), Math.Abs(z + 0.5f)) < HalfSize) Plant(parent, x, z);
    }

    /// <summary>A house and its yard, which differs from house to house: a chest, a forge, a pumpkin patch or a
    /// little carrot bed, chickens, bushes, and a villager or a farmer out front.</summary>
    void BuildHouse(Transform parent, Plot p)
    {
        // Neighbours stand a block or two away, so the yard is in front, either side of the door.
        float y = GroundY(p.X, p.Z), edge = p.W / 2f - 0.6f, front = p.D / 2f + 0.8f;
        void Put(Prefab? prefab, float x, float z, float yaw = 0f, float lift = 0f)
        {
            var at = p.World(x, z);
            Place(parent, prefab, at.X, y + lift, at.Y, p.Yaw + yaw);
        }
        Place(parent, p.Prefab, p.X, y, p.Z, p.Yaw);
        Put(Hash(p.X, p.Z, 81) < 0.5f ? CratePair : Barrel, edge, front);
        Put(Hash(p.X, p.Z, 83) < 0.3f ? Farmer : Villager, 1.3f, front + 0.6f);
        float yard = Hash(p.X, p.Z, 82);
        if (yard < 0.25f)
            for (int i = 0; i < 2; i++) Put(Chicken, -edge + i * 1.2f, front + 0.4f);
        else if (yard < 0.45f) Put(Forge, -edge + 0.6f, front + 0.2f);
        else if (yard < 0.65f)
            for (int i = 0; i < 3; i++) Put(Pumpkin, -edge + i * 0.8f, front - 0.1f, Hash(p.X, i, 84) * 90f);
        else if (yard < 0.85f)
            for (int i = 0; i < 6; i++) Put(Carrots, -edge + i % 3, front - 0.2f + i / 3, lift: 0.03f);
        if (Hash(p.X, p.Z, 85) < 0.35f) Put(Chest, edge - 1.1f, front - 0.1f);
        if (Hash(p.X, p.Z, 86) < 0.6f) Put(FlowerBlue, edge - 0.2f, front + 0.9f);
    }

    /// <summary>Ground cover by biome: flowers and bushes in meadows (blue flowers in birch groves), mushrooms
    /// under trees, boulders on rocky hills, lily pads on ponds, now and then an animal or a chest in the wild.</summary>
    void Plant(Transform parent, int x, int z)
    {
        if (IsPond(x, z))
        {
            if (Hash(x, z, 99) < 0.12f) Place(parent, LilyPad, x + 0.5f, GroundY(x, z) - 0.38f, z + 0.5f, Hash(x, z, 93) * 360f);
            return;
        }
        if (!Grassy(x, z) && !(BiomeAt(x, z) == Biome.Rocky && !Taken(x, z))) return;
        float roll = Hash(x, z, 91), y = GroundY(x, z);
        var biome = BiomeAt(x, z);
        if (roll < 0.002f && biome == Biome.Meadow && !InVillage(x, z))
        {
            Place(parent, Hash(x, z, 92) < 0.5f ? Cow : Chicken, x + 0.5f, y, z + 0.5f, Hash(x, z, 93) * 360f);
            return;
        }
        if (roll < 0.0035f && biome != Biome.Meadow)
        {
            Place(parent, Chest, x + 0.5f, y, z + 0.5f, (int)(Hash(x, z, 93) * 4) * 90f); // treasure in the wild
            return;
        }
        if (_grid!.Get(x, Level(x, z) + 1, z) != 0) return; // under a hedge or tree trunk
        float pick = Hash(x, z, 94);
        Prefab? prefab = biome switch
        {
            Biome.Rocky => roll < 0.03f ? Boulder : roll < 0.08f ? TallGrass : null,
            Biome.Pine => roll < 0.04f ? Mushroom : roll < 0.06f ? Boulder : roll < 0.12f ? TallGrass : null,
            Biome.Oak => roll < 0.03f ? Mushroom : roll < 0.16f ? (pick < 0.7f ? TallGrass : FlowerRed) : null,
            Biome.Birch => roll < 0.25f ? (pick < 0.4f ? TallGrass : pick < 0.8f ? FlowerBlue : FlowerYellow) : null,
            _ => roll < 0.012f && !InVillage(x, z) ? Bush : roll < 0.02f && !InVillage(x, z) ? Pumpkin
                : roll < 0.22f ? (pick < 0.45f ? TallGrass : pick < 0.7f ? FlowerYellow : pick < 0.88f ? FlowerRed : FlowerBlue) : null,
        };
        if (prefab is null) return;
        bool big = prefab == Bush || prefab == Boulder || prefab == Pumpkin;
        float jitter = big ? 0.5f : Hash(x, z, 95), jitterZ = big ? 0.5f : Hash(x, z, 96);
        if (Place(parent, prefab, x + jitter, y, z + jitterZ, (int)(Hash(x, z, 97) * 4) * 90f) is { } plant && prefab == TallGrass)
            plant.Transform.LocalScale = new Vector3(0.75f + Hash(x, z, 98) * 0.25f);
    }

    bool Grassy(int x, int z)
    {
        if (Taken(x, z)) return false;
        int top = Level(x, z);
        byte block = _grid!.Get(x, top, z);
        return block == _grass || block == _forestGrass;
    }

    // ---- Helpers ----

    GameObject? Place(Transform parent, Prefab? prefab, float x, float y, float z, float yaw = 0f)
    {
        if (prefab is null || Scene is null) return null;
        var go = Scene.Instantiate(prefab, parent);
        go.Transform.LocalPosition = new Vector3(x, y, z);
        go.Transform.LocalEulerAngles = new Vector3(0f, yaw, 0f);
        return go;
    }

    byte BlockId(string name) => (byte)Math.Max(0, _palette.IdOf(name));

    /// <summary>A repeatable random number in [0, 1) for a position, varied by <paramref name="salt"/> and the seed.</summary>
    float Hash(int x, int z, int salt)
    {
        uint h = (uint)(x * 73856093 ^ z * 19349663 ^ (salt + _seed) * 83492791);
        h ^= h >> 13;
        h *= 0x5bd1e995;
        h ^= h >> 15;
        return (h & 0xffffff) / (float)0x1000000;
    }

    float Noise(float x, float z, int salt)
    {
        int ix = (int)MathF.Floor(x), iz = (int)MathF.Floor(z);
        float fx = x - ix, fz = z - iz;
        fx = fx * fx * (3 - 2 * fx);
        fz = fz * fz * (3 - 2 * fz);
        float top = MathX.Lerp(Hash(ix, iz, salt), Hash(ix + 1, iz, salt), fx);
        float bottom = MathX.Lerp(Hash(ix, iz + 1, salt), Hash(ix + 1, iz + 1, salt), fx);
        return MathX.Lerp(top, bottom, fz);
    }
}
