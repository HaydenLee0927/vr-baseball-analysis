import type { NewPlayer, Rec } from './data';
import { uniqueId } from './romanize';

/** Name lookup for the charting tool. Charters work with VRChat names; rows store player_id. */
export class People {
  private byId = new Map<string, { vrchat_name: string; display_name: string }>();
  private byName = new Map<string, string>();

  constructor(players: Rec[], aliases: Rec[], newPlayers: NewPlayer[]) {
    for (const p of [...players, ...newPlayers]) {
      this.byId.set(p.player_id, { vrchat_name: p.vrchat_name, display_name: p.display_name ?? '' });
      for (const key of [p.player_id, p.vrchat_name, p.display_name]) if (key) this.byName.set(key, p.player_id);
    }
    for (const a of aliases) this.byName.set(a.alias, a.player_id);
  }

  name(id: string | null | undefined): string {
    if (!id) return '';
    return this.byId.get(id)?.vrchat_name ?? id;
  }

  /** player_id for a VRChat name, alias, display name or id, or null if unknown. */
  resolve(text: string): string | null {
    return this.byName.get(text.trim()) ?? null;
  }

  /** Every VRChat name, for autocomplete. */
  names(): string[] {
    return [...this.byId.values()].map((p) => p.vrchat_name).sort((a, b) => a.localeCompare(b));
  }

  async newPlayer(vrchatName: string): Promise<NewPlayer> {
    const taken = new Set([...this.byId.keys()]);
    const id = await uniqueId(vrchatName.trim(), taken);
    return { player_id: id, display_name: null, vrchat_name: vrchatName.trim(), slug: id, default_bats: null, default_throws: null };
  }
}
