import { BLOCK_GRASS } from "../world/TextureManager";
import { createSceneBundle } from "../core/scene";
import { GameSession } from "../game/GameSession";

export async function bootstrapGame() {
  const bundle = createSceneBundle(document.body);
  const session = new GameSession(bundle);

  session.player.selectedBlockType = BLOCK_GRASS;
  await session.init();
}
