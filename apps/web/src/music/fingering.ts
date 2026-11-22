/** The fingering optimiser lives in @guitar3d/shared (the server's auto-transcription uses it too). */
export {
  assignFingers, candidates, feasiblePositions, fingerPitches, fretSpan, handPosition, sequenceCost, shapeCost, shiftCost, stringJumpCost,
  suggestFingering, type BeatPositions, type FingeringOptions, type FingeringResult, type Placed,
} from '@guitar3d/shared';
