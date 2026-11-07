public enum ItemKind { Melee, Ranged, Potion }

/// <summary>Something the player can carry and use: a weapon or a potion, with its icon and the model held in the hand.</summary>
[Serializable]
public class Item
{
    public string Name = "Item";
    public ItemKind Kind;
    public Texture? Icon;
    public Mesh? HeldMesh;
    public Material? HeldMaterial;
    /// <summary>A billboard showing the icon, for the item lying on the ground or on a stall.</summary>
    public Material? Display;
    /// <summary>Damage per hit (melee) or per arrow (ranged).</summary>
    public float Damage = 1f;
    /// <summary>Seconds between uses.</summary>
    public float Cooldown = 0.5f;
    /// <summary>How far a melee swing reaches.</summary>
    public float Reach = 1.6f;
    /// <summary>How many (potions stack).</summary>
    public int Count = 1;
    /// <summary>Health a potion restores.</summary>
    public float Heal;

    public Item Clone() => (Item)MemberwiseClone();

    /// <summary>A one-line description for the inventory screen.</summary>
    public string Describe() => Kind switch
    {
        ItemKind.Melee => $"{Name}: {Damage:0} damage",
        ItemKind.Ranged => $"{Name}: {Damage:0} damage per arrow",
        _ => $"{Name} x{Count}: heals {Heal:0}",
    };
}
