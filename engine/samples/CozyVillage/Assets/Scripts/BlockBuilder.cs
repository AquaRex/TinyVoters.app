/// <summary>
/// Building, Minecraft style: a hotbar of blocks along the bottom of the screen (keys 1–9, the scroll wheel or a
/// click picks one), left-click breaks the block under the mouse and right-click places the chosen block against it,
/// within <see cref="Reach"/> of the player.
/// </summary>
public class BlockBuilder : Behaviour
{
    public BlockGrid? World;
    /// <summary>Block names from the world's palette, in hotbar order.</summary>
    public List<string> Hotbar = ["Grass", "Dirt", "Stone", "Planks", "Log", "Leaves", "Sand"];
    public float Reach = 7f;

    const int SlotSize = 20, Gap = 2;
    static readonly Color Panel = new(0.17f, 0.12f, 0.09f, 0.82f), SlotColor = new(0.36f, 0.27f, 0.19f, 0.9f);
    static readonly Color Selected = new(1f, 0.93f, 0.7f), Outline = new(1f, 1f, 1f, 0.85f);

    int _selected;

    protected override void Update()
    {
        if (World is not { Palette: { } palette } || Hotbar.Count == 0) return;
        Choose();
        var origin = new Vector2((Gui.Width - Hotbar.Count * (SlotSize + Gap) + Gap) / 2, Gui.Height - SlotSize - 6);
        DrawHotbar(palette, origin);
        if (Gui.IsMouseOver(origin - new Vector2(3), new Vector2(Hotbar.Count * (SlotSize + Gap) + 4, SlotSize + 6))) return;
        if (Camera.Main is not { } camera || !World.Raycast(camera.ScreenPointToRay(Input.MousePosition), 500f, out var hit, out var normal)) return;

        var world = World.Transform.TransformPoint(new Vector3(hit.X + 0.5f, hit.Y + 0.5f, hit.Z + 0.5f));
        if (Vector3.Distance(world, Transform.Position) > Reach) return;
        DrawCursor(camera, hit);
        if (Input.GetMouseButtonDown(MouseButton.Left)) World.Set(hit, 0);
        else if (Input.GetMouseButtonDown(MouseButton.Right) && palette.IdOf(Hotbar[_selected]) is > 0 and var id && !Inside(hit + normal))
            World.Set(hit + normal, (byte)id);
    }

    void Choose()
    {
        for (int i = 0; i < Math.Min(9, Hotbar.Count); i++)
            if (Input.GetKeyDown(Key.Number1 + i)) _selected = i;
        if (Input.ScrollDelta != 0) _selected -= Math.Sign(Input.ScrollDelta);
        _selected = (_selected % Hotbar.Count + Hotbar.Count) % Hotbar.Count;
    }

    /// <summary>Whether a cell overlaps the player (so we don't build a block into ourselves).</summary>
    bool Inside(Cell cell)
    {
        var feet = Vector3.Transform(Transform.Position, World!.Transform.WorldToLocalMatrix);
        return (int)MathF.Floor(feet.X) == cell.X && (int)MathF.Floor(feet.Z) == cell.Z && cell.Y >= (int)MathF.Floor(feet.Y + 0.01f) && cell.Y < feet.Y + 1.2f;
    }

    void DrawHotbar(BlockPalette palette, Vector2 origin)
    {
        Gui.DrawRect(origin - new Vector2(3), new Vector2(Hotbar.Count * (SlotSize + Gap) + 4, SlotSize + 6), Panel);
        for (int i = 0; i < Hotbar.Count; i++)
        {
            var slot = origin + new Vector2(i * (SlotSize + Gap), 0);
            Gui.DrawRect(slot, new Vector2(SlotSize), SlotColor);
            if (palette[palette.IdOf(Hotbar[i])] is { } block) DrawBlockIcon(block, slot + new Vector2(SlotSize / 2f, SlotSize / 2f));
            if (i == _selected) Gui.DrawFrame(slot - new Vector2(1), new Vector2(SlotSize + 2), Selected);
            if (Gui.IsMouseOver(slot, new Vector2(SlotSize)) && Input.GetMouseButtonDown(MouseButton.Left)) _selected = i;
        }
    }

    /// <summary>A little isometric cube: the top texture on a diamond, the side texture on two shaded faces.</summary>
    static void DrawBlockIcon(BlockType block, Vector2 c)
    {
        const float w = 7f, h = 3.5f, tall = 7f;
        var side = block.Side ?? block.Top;
        Color Shade(float k) => new(block.Color.R * k, block.Color.G * k, block.Color.B * k);
        var top = new Vector2(c.X, c.Y - tall / 2 - h);
        var (left, right, middle) = (top + new Vector2(-w, h), top + new Vector2(w, h), top + new Vector2(0, 2 * h));
        var down = new Vector2(0, tall);
        Gui.DrawQuad(left, middle, middle + down, left + down, Shade(0.78f), side);
        Gui.DrawQuad(middle, right, right + down, middle + down, Shade(0.6f), side);
        Gui.DrawQuad(top, right, middle, left, Shade(1f), block.Top);
    }

    /// <summary>Outlines the faces of the targeted block that face the camera.</summary>
    void DrawCursor(Camera camera, Cell cell)
    {
        var corners = new Vector2?[8];
        for (int i = 0; i < 8; i++)
        {
            var local = new Vector3(cell.X + (i & 1), cell.Y + (i >> 1 & 1), cell.Z + (i >> 2 & 1));
            corners[i] = camera.WorldToScreenPoint(World!.Transform.TransformPoint(local)) is { } p ? Gui.FromScreen(p) : null;
        }
        var forward = camera.Transform.Forward;
        // Faces as (axis bit, side): corners on a face share that bit's value.
        for (int axis = 0; axis < 3; axis++)
            for (int sideBit = 0; sideBit < 2; sideBit++)
            {
                var normal = new Vector3(axis == 0 ? 1 : 0, axis == 1 ? 1 : 0, axis == 2 ? 1 : 0) * (sideBit == 0 ? -1 : 1);
                if (Vector3.Dot(normal, forward) >= 0) continue;
                int bit = 1 << axis;
                for (int i = 0; i < 8; i++)
                    for (int other = 1; other < 8; other <<= 1)
                        if (other != bit && (i & other) == 0 && ((i & bit) != 0) == (sideBit == 1)
                            && corners[i] is { } a && corners[i | other] is { } b)
                            Gui.DrawLine(a, b, Outline);
            }
    }
}
