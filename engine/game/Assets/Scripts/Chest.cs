/// <summary>A chest the player opens with E when close: its lid swings up and it gives a new item from the
/// player's loot list (a potion once they have everything), plus some arrows.</summary>
public class Chest : Behaviour
{
    public Transform? Lid;
    public float Reach = 1.8f;

    bool _opened;
    float _open;

    protected override void Update()
    {
        _open = MathX.Lerp(_open, _opened ? 1f : 0f, 1f - MathF.Exp(-10f * Time.DeltaTime));
        if (Lid is not null) Lid.LocalEulerAngles = new Vector3(_open * 105f, 0f, 0f);
        if (_opened || Inventory.Player is not { } inventory) return;
        if (Vector3.Distance(inventory.Transform.Position, Transform.Position) > Reach) return;

        if (Camera.Main?.WorldToScreenPoint(Transform.Position + new Vector3(0f, 1.1f, 0f)) is { } screen)
        {
            const string prompt = "E: OPEN";
            var at = Gui.FromScreen(screen) - new Vector2(Gui.MeasureText(prompt).X / 2, 0);
            Gui.DrawText(prompt, new Vector2(MathF.Round(at.X), MathF.Round(at.Y)), Color.White, shadow: new Color(0.1f, 0.07f, 0.05f, 0.8f));
        }
        if (Input.GetKeyDown(Key.E)) Open(inventory);
    }

    void Open(Inventory inventory)
    {
        _opened = true;
        var fresh = inventory.Loot.Where(item => item.Kind == ItemKind.Potion || !inventory.Has(item.Name)).ToList();
        var nonPotions = fresh.Where(item => item.Kind != ItemKind.Potion).ToList();
        var found = (nonPotions.Count > 0 && Random.Shared.NextSingle() < 0.6f ? nonPotions : fresh) is { Count: > 0 } pool
            ? pool[Random.Shared.Next(pool.Count)]
            : null;
        var above = Transform.Position + new Vector3(0f, 1.6f, 0f);
        if (found is not null)
        {
            inventory.Add(found);
            PlayerHud.Show(above, "FOUND: " + found.Name, new Color(1f, 0.9f, 0.5f));
        }
        inventory.Arrows += 6;
        PlayerHud.Show(above + new Vector3(0f, -0.5f, 0f), "+6 ARROWS", new Color(0.95f, 0.9f, 0.7f));
    }
}
