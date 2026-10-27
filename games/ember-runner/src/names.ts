/**
 * games/ember-runner — scene name constants.
 *
 * Kept in their own module so scene builders, systems, scripts, the CLI and the tests all
 * refer to the same strings without importing each other in a circle.
 */

export const TITLE_SCENE = "title";
export const LEVEL_ONE = "level-1";
export const LEVEL_TWO = "level-2";
/** Scene a session starts in when the player launches the game. */
export const START_SCENE = LEVEL_ONE;
