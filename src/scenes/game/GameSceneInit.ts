import { DungeonData, Room, RoomType } from '../../systems/DungeonGenerator';
import { SinWorld } from '../../config/WorldConfig';
import { TILE_SIZE, DUNGEON_WIDTH, DUNGEON_HEIGHT } from '../../utils/constants';
import { hasWangTileset, getWangMapping, getWangTileFrame, getSimpleCornerValues } from '../../systems/WangTileSystem';

/**
 * Create dungeon floor and wall tiles
 */
export function createDungeonTiles(
  scene: Phaser.Scene,
  dungeon: DungeonData,
  currentWorld: SinWorld | null
): { wallLayer: Phaser.GameObjects.Group; floorLayer: Phaser.GameObjects.Group } {
  const floorLayer = scene.add.group();
  const wallLayer = scene.physics.add.staticGroup();

  // Check if we have a Wang tileset for this world
  const useWangTiles = currentWorld && hasWangTileset(currentWorld);
  const wangMapping = useWangTiles ? getWangMapping(currentWorld!) : null;
  const tilesetKey = useWangTiles ? `tileset_${currentWorld}` : null;

  // Fallback textures for non-Wang rendering
  const wallTexture = currentWorld ? `wall_${currentWorld}` : 'wall';

  for (let y = 0; y < DUNGEON_HEIGHT; y++) {
    for (let x = 0; x < DUNGEON_WIDTH; x++) {
      const tileX = x * TILE_SIZE;
      const tileY = y * TILE_SIZE;

      if (useWangTiles && wangMapping && tilesetKey && scene.textures.exists(tilesetKey)) {
        // Use Wang tileset for connected textures
        const corners = getSimpleCornerValues(
          dungeon.tiles, x, y, DUNGEON_WIDTH, DUNGEON_HEIGHT
        );
        const frameIndex = getWangTileFrame(
          corners.nw, corners.ne, corners.sw, corners.se, wangMapping
        );

        if (dungeon.tiles[y][x] === 1) {
          // Wall tile with Wang texture
          const wall = wallLayer.create(tileX, tileY, tilesetKey, frameIndex) as Phaser.Physics.Arcade.Sprite;
          wall.setOrigin(0, 0);
          wall.setImmovable(true);
          wall.refreshBody();
          // Apply Light2D pipeline for dynamic lighting
          wall.setPipeline('Light2D');
        } else {
          // Floor tile with Wang texture
          const floor = scene.add.sprite(tileX, tileY, tilesetKey, frameIndex).setOrigin(0, 0);
          floor.setDepth(0);
          // Apply Light2D pipeline for dynamic lighting
          floor.setPipeline('Light2D');
          floorLayer.add(floor);
        }
      } else {
        // Fallback to simple textures
        if (dungeon.tiles[y][x] === 1) {
          const wall = wallLayer.create(tileX, tileY, wallTexture) as Phaser.Physics.Arcade.Sprite;
          wall.setOrigin(0, 0);
          wall.setImmovable(true);
          wall.refreshBody();
          // Apply Light2D pipeline for dynamic lighting
          wall.setPipeline('Light2D');
        } else if (dungeon.tiles[y][x] === 0) {
          const room = getRoomAtTile(dungeon, x, y);
          const floorTexture = getFloorTextureForRoom(room, currentWorld);
          const floor = scene.add.sprite(tileX, tileY, floorTexture).setOrigin(0, 0);
          floor.setDepth(0);
          // Apply Light2D pipeline for dynamic lighting
          floor.setPipeline('Light2D');
          floorLayer.add(floor);
        }
      }
    }
  }

  return { wallLayer, floorLayer };
}

/**
 * Get the room at a specific tile coordinate
 */
function getRoomAtTile(dungeon: DungeonData, x: number, y: number): Room | null {
  for (const room of dungeon.rooms) {
    if (x >= room.x && x < room.x + room.width &&
        y >= room.y && y < room.y + room.height) {
      return room;
    }
  }
  return null;
}

/**
 * Get the floor texture for a room based on its type
 */
function getFloorTextureForRoom(room: Room | null, currentWorld: SinWorld | null): string {
  // Default floor texture based on current world
  const defaultFloor = currentWorld ? `floor_${currentWorld}` : 'floor';

  if (!room) return defaultFloor; // Corridors use world floor

  switch (room.type) {
    case RoomType.TREASURE:
      return 'floor_treasure';
    case RoomType.TRAP:
      return 'floor_trap';
    case RoomType.SHRINE:
      return 'floor_shrine';
    case RoomType.CHALLENGE:
      return 'floor_challenge';
    default:
      return defaultFloor;
  }
}
