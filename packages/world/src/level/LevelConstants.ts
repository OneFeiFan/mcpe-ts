export class LevelConstants {
  public static CHUNK_CACHE_WIDTH: number = 16; // in chunks
  public static CHUNK_WIDTH: number = 16; // in blocks
  public static CHUNK_DEPTH: number = 16;
  public static LEVEL_WIDTH: number = LevelConstants.CHUNK_CACHE_WIDTH * LevelConstants.CHUNK_WIDTH;
  public static LEVEL_DEPTH: number = LevelConstants.CHUNK_CACHE_WIDTH * LevelConstants.CHUNK_DEPTH;
  public static LEVEL_HEIGHT: number = 128;
  public static CHUNK_COLUMNS: number = LevelConstants.CHUNK_WIDTH * LevelConstants.CHUNK_DEPTH;
  public static CHUNK_BLOCK_COUNT: number =
    LevelConstants.CHUNK_COLUMNS * LevelConstants.LEVEL_HEIGHT;
}
