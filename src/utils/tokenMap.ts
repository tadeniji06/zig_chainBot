export class TokenMap {
  private static instance: TokenMap;
  private idToDenom: Map<number, string> = new Map();
  private denomToId: Map<string, number> = new Map();
  private nextId = 1;

  private constructor() {}

  static getInstance(): TokenMap {
    if (!TokenMap.instance) {
      TokenMap.instance = new TokenMap();
    }
    return TokenMap.instance;
  }

  getId(denom: string): number {
    if (this.denomToId.has(denom)) {
      return this.denomToId.get(denom)!;
    }

    const id = this.nextId++;
    this.denomToId.set(denom, id);
    this.idToDenom.set(id, denom);
    return id;
  }

  getDenom(id: number): string | undefined {
    return this.idToDenom.get(id);
  }
}

export const tokenMap = TokenMap.getInstance();
