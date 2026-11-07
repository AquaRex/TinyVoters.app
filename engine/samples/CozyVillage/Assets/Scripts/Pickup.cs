/// <summary>One entry in a creature's drops: an item or a handful of arrows, with the chance it drops.</summary>
[Serializable]
public class Drop
{
    /// <summary>The item, or nothing for arrows only.</summary>
    public Item? Item;
    public int MinArrows, MaxArrows;
    [Range(0, 1)] public float Chance = 1f;
}

/// <summary>
/// Something lying on the ground to pick up (a creature's drop): it pops out, bobs and turns, drifts to the player
/// when they come close and is collected on touch. It holds an item or some arrows, and fades away after a while.
/// </summary>
public class Pickup : Behaviour
{
    public Item? Item;
    public int Arrows;
    /// <summary>Shown for arrows (items show their own <see cref="Item.Display"/>).</summary>
    public Material? ArrowDisplay;
    public float MagnetRange = 2.5f;
    public float Lifetime = 60f;

    Transform? _icon;
    Vector3 _scatter;
    float _age;

    /// <summary>Drops what a list of <see cref="Drop"/>s rolls, scattered around a point.</summary>
    public static void Spill(Scene scene, Prefab prefab, Vector3 at, IEnumerable<Drop> drops)
    {
        foreach (var drop in drops)
        {
            if (Random.Shared.NextSingle() > drop.Chance) continue;
            int arrows = drop.MaxArrows > 0 ? Random.Shared.Next(drop.MinArrows, drop.MaxArrows + 1) : 0;
            if (drop.Item is null && arrows == 0) continue;
            var pickup = scene.Instantiate(prefab).GetComponent<Pickup>();
            if (pickup is null) continue;
            pickup.Transform.Position = at;
            (pickup.Item, pickup.Arrows) = (drop.Item?.Clone(), drop.Item is null ? arrows : 0);
            float angle = Random.Shared.NextSingle() * MathF.Tau;
            pickup._scatter = new Vector3(MathF.Cos(angle), 0f, MathF.Sin(angle)) * (1.5f + Random.Shared.NextSingle());
        }
    }

    protected override void Start()
    {
        _icon = Transform.FindDescendant("Icon");
        if (_icon?.GetComponent<MeshRenderer>() is { } renderer) renderer.Material = Item?.Display ?? ArrowDisplay;
    }

    protected override void Update()
    {
        _age += Time.DeltaTime;
        if (_age > Lifetime && Scene is { } scene) scene.Destroy(GameObject);
        // Pop out: a little hop away from where it dropped.
        if (_age < 0.4f)
        {
            Transform.Position += _scatter * Time.DeltaTime * (1f - _age / 0.4f) * 2f;
            float hop = MathF.Sin(_age / 0.4f * MathF.PI) * 0.6f;
            if (_icon is not null) _icon.LocalPosition = new Vector3(0f, 0.35f + hop, 0f);
            return;
        }
        if (_icon is not null)
        {
            _icon.LocalPosition = new Vector3(0f, 0.35f + MathF.Sin(_age * 3f) * 0.08f, 0f);
            _icon.LocalScale = new Vector3(_age > Lifetime - 3f && (int)(_age * 6f) % 2 == 0 ? 0f : 0.6f); // blinks before it goes
        }
        if (Inventory.Player is not { } inventory) return;
        var to = inventory.Transform.Position - Transform.Position;
        float distance = to.Length();
        if (distance < 0.6f) Collect(inventory);
        else if (distance < MagnetRange) Transform.Position += to / distance * MathF.Min(distance, 7f * Time.DeltaTime);
    }

    void Collect(Inventory inventory)
    {
        var above = Transform.Position + new Vector3(0f, 1.6f, 0f);
        if (Item is not null)
        {
            inventory.Add(Item);
            PlayerHud.Show(above, "+ " + Item.Name, new Color(1f, 0.9f, 0.5f));
        }
        else
        {
            inventory.Arrows += Arrows;
            PlayerHud.Show(above, $"+{Arrows} ARROWS", new Color(0.95f, 0.9f, 0.7f));
        }
        Scene?.Destroy(GameObject);
    }
}
