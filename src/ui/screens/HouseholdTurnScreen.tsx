import type { GameState, ParticipantId, HouseholdState, StoreState } from "../../types/domain.js";
import type { DecisionSubmitter } from "../network/DecisionSubmitter.js";
import { ShoppingTurnScreen } from "./ShoppingTurnScreen.js";
interface Props {
  session: DecisionSubmitter; state: GameState; version: number; household: HouseholdState;
  stores: Record<ParticipantId, StoreState>;
  onSubmitted: () => void; disabled?: boolean;
}
export function HouseholdTurnScreen(props: Props) {
  return <ShoppingTurnScreen session={props.session} state={props.state} role="household" participantId={props.household.id} onSubmitted={props.onSubmitted} disabled={props.disabled ?? false} />;
}
