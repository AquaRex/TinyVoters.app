/// <summary>
/// What the player carries. A hotbar of five slots along the bottom of the screen (1–5, the scroll wheel or a click
/// picks one); the chosen item is held in the hand and used by <see cref="PlayerCombat"/>. Tab or I opens the
/// inventory, where clicking an item puts it on the chosen slot.
/// </summary>
public class Inventory : Behaviour
{
    public List<Item> Items = [];
    /// <summary>Index into <see cref="Items"/> per hotbar slot; -1 is empty.</summary>
    public List<int> Hotbar = [0, 1, -1, -1, -1];
    public int Arrows = 20;
    /// <summary>What chests can hold.</summary>
    public List<Item> Loot = [];
    public Texture? ArrowIcon;

    /// <summary>The player's inventory, for chests and kills to add to.</summary>
    public static Inventory? Player { get; private set; }

    public int Selected { get; private set; }
    public bool IsOpen { get; private set; }
    /// <summary>The mouse is over the hotbar or the open inventory, so clicks there don't attack.</summary>
    public bool PointerOverUi { get; private set; }
    public Item? Equipped => Hotbar.Count > 0 && Hotbar[Selected] is >= 0 and var i && i < Items.Count ? Items[i] : null;
    /// <summary>The object holding the equipped item's model; <see cref="PlayerCombat"/> swings it.</summary>
    public Transform? Hand { get; private set; }

    const int Slot = 22, Gap = 2, Columns = 6;
    static readonly Color Panel = new(0.17f, 0.12f, 0.09f, 0.85f), SlotColor = new(0.36f, 0.27f, 0.19f, 0.9f);
    static readonly Color Highlight = new(1f, 0.93f, 0.7f), Text = new(0.98f, 0.95f, 0.88f), Shadow = new(0.1f, 0.07f, 0.05f, 0.8f);

    MeshRenderer? _held;

    protected override void Start()
    {
        Player = this;
        // The held item hangs from the right hand, tilted forward.
        if (Transform.FindDescendant("Arm R") is { } arm && Scene is { } scene)
        {
            var hand = scene.CreateGameObject("Hand", arm);
            hand.Transform.LocalPosition = new Vector3(0f, -0.27f, -0.04f);
            hand.Transform.LocalEulerAngles = new Vector3(-70f, 0f, 0f);
            hand.Transform.LocalScale = new Vector3(1.4f); // chunky, so weapons read at pixel scale
            _held = hand.AddComponent<MeshRenderer>();
            Hand = hand.Transform;
        }
    }

    protected override void OnDestroy()
    {
        if (Player == this) Player = null;
    }

    protected override void Update()
    {
        if (Input.GetKeyDown(Key.Tab) || Input.GetKeyDown(Key.I)) IsOpen = !IsOpen;
        for (int i = 0; i < Hotbar.Count; i++)
            if (Input.GetKeyDown(Key.Number1 + i)) Selected = i;
        if (!IsOpen && Input.ScrollDelta != 0 && Hotbar.Count > 0)
            Selected = ((Selected - Math.Sign(Input.ScrollDelta)) % Hotbar.Count + Hotbar.Count) % Hotbar.Count;

        PointerOverUi = false;
        DrawHotbar();
        if (IsOpen) DrawInventory();
        ShowEquipped();
    }

    /// <summary>Adds an item: potions stack, anything new goes on the first empty hotbar slot.</summary>
    public void Add(Item item)
    {
        if (item.Kind == ItemKind.Potion && Items.Find(i => i.Name == item.Name) is { } stack)
        {
            stack.Count += item.Count;
            return;
        }
        Items.Add(item.Clone());
        int empty = Hotbar.IndexOf(-1);
        if (empty >= 0) Hotbar[empty] = Items.Count - 1;
    }

    public bool Has(string name) => Items.Exists(i => i.Name == name);

    /// <summary>Uses up one of a stack, removing the item when none are left.</summary>
    public void Consume(Item item)
    {
        if (--item.Count > 0) return;
        int index = Items.IndexOf(item);
        if (index < 0) return;
        Items.RemoveAt(index);
        for (int s = 0; s < Hotbar.Count; s++)
            Hotbar[s] = Hotbar[s] == index ? -1 : Hotbar[s] > index ? Hotbar[s] - 1 : Hotbar[s];
    }

    void DrawHotbar()
    {
        var size = new Vector2(Hotbar.Count * (Slot + Gap) + 4, Slot + 6);
        var origin = new Vector2((Gui.Width - size.X) / 2 + 3, Gui.Height - Slot - 6);
        Gui.DrawRect(origin - new Vector2(3), size, Panel);
        PointerOverUi |= Gui.IsMouseOver(origin - new Vector2(3), size);
        for (int s = 0; s < Hotbar.Count; s++)
        {
            var slot = origin + new Vector2(s * (Slot + Gap), 0);
            var item = Hotbar[s] >= 0 && Hotbar[s] < Items.Count ? Items[Hotbar[s]] : null;
            DrawSlot(slot, item, s == Selected);
            Gui.DrawText((s + 1).ToString(), slot + new Vector2(2, 2), Text with { A = 0.6f });
            if (item?.Kind == ItemKind.Ranged) DrawCount(slot, Arrows);
            if (Gui.IsMouseOver(slot, new Vector2(Slot)) && Input.GetMouseButtonDown(MouseButton.Left)) Selected = s;
        }
        if (ArrowIcon is not null)
        {
            var at = origin + new Vector2(Hotbar.Count * (Slot + Gap) + 6, 4);
            Gui.DrawTexture(at, new Vector2(16), ArrowIcon);
            Gui.DrawText(Arrows.ToString(), at + new Vector2(17, 5), Text, shadow: Shadow);
        }
    }

    void DrawInventory()
    {
        int rows = Math.Max(1, (Items.Count + Columns - 1) / Columns);
        var size = new Vector2(Columns * (Slot + Gap) + 8, rows * (Slot + Gap) + 32);
        var origin = new Vector2((Gui.Width - size.X) / 2, Gui.Height - Slot - 18 - size.Y);
        Gui.DrawRect(origin, size, Panel);
        Gui.DrawFrame(origin, size, Highlight with { A = 0.4f });
        PointerOverUi |= Gui.IsMouseOver(origin, size);
        Gui.DrawText("INVENTORY", origin + new Vector2(5, 5), Highlight, shadow: Shadow);
        string hint = "CLICK AN ITEM TO PUT IT IN SLOT " + (Selected + 1);
        for (int i = 0; i < Items.Count; i++)
        {
            var slot = origin + new Vector2(5 + i % Columns * (Slot + Gap), 16 + i / Columns * (Slot + Gap));
            DrawSlot(slot, Items[i], Hotbar.Contains(i));
            if (!Gui.IsMouseOver(slot, new Vector2(Slot))) continue;
            hint = Items[i].Describe();
            if (Input.GetMouseButtonDown(MouseButton.Left))
            {
                for (int s = 0; s < Hotbar.Count; s++)
                    if (Hotbar[s] == i) Hotbar[s] = -1; // an item sits on one slot at a time
                Hotbar[Selected] = i;
            }
        }
        Gui.DrawText(hint, origin + new Vector2(5, size.Y - 10), Text);
    }

    void DrawSlot(Vector2 slot, Item? item, bool highlighted)
    {
        Gui.DrawRect(slot, new Vector2(Slot), SlotColor);
        if (item?.Icon is { } icon) Gui.DrawTexture(slot + new Vector2(3), new Vector2(16), icon);
        if (item is { Kind: ItemKind.Potion }) DrawCount(slot, item.Count);
        if (highlighted) Gui.DrawFrame(slot - new Vector2(1), new Vector2(Slot + 2), Highlight);
    }

    static void DrawCount(Vector2 slot, int count)
    {
        var text = count.ToString();
        Gui.DrawText(text, slot + new Vector2(Slot - 1 - Gui.MeasureText(text).X, Slot - 7), Text, shadow: Shadow);
    }

    void ShowEquipped()
    {
        if (_held is null) return;
        var item = Equipped;
        _held.Mesh = item?.HeldMesh;
        _held.Material = item?.HeldMaterial;
        _held.Enabled = item is not null;
    }
}
