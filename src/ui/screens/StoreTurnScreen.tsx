import type { GameState, ParticipantId, StoreState, CompanyState } from "../../types/domain.js";
import type { DecisionSubmitter } from "../network/DecisionSubmitter.js";
import { ShoppingTurnScreen } from "./ShoppingTurnScreen.js";
interface Props {
  session: DecisionSubmitter; state: GameState; version: number; store: StoreState;
  companies: Record<ParticipantId, CompanyState>;
  onSubmitted: () => void; disabled?: boolean;
}
export function StoreTurnScreen(props: Props) {
  return <ShoppingTurnScreen session={props.session} state={props.state} role="store" participantId={props.store.id} onSubmitted={props.onSubmitted} disabled={props.disabled ?? false} />;
}
