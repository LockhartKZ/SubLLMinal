/**
 * Tone / formality register.
 *
 * A small catalog of registers the user can pick from a dropdown. The chosen
 * option's `instruction` is injected into the system prompt (`buildSystemPrompt`)
 * so the model targets a consistent register — most importantly the formal vs
 * familiar "you" (vous/Sie/usted vs tu/du/tú) in languages that distinguish it.
 *
 * `default` injects nothing, preserving the model's natural choice (and keeping
 * existing behaviour unchanged for anyone who never touches the setting).
 */

export type ToneId = "default" | "formal" | "informal";

export interface ToneOption {
  id: ToneId;
  /** Shown in the dropdown. */
  label: string;
  /** Injected into the system prompt; empty string = no instruction. */
  instruction: string;
}

export const TONE_OPTIONS: ToneOption[] = [
  { id: "default", label: "Default (model decides)", instruction: "" },
  {
    id: "formal",
    label: "Formal / polite",
    instruction:
      "Use a formal, polite register. Where the target language distinguishes levels " +
      "of address, use the formal/respectful 'you' (e.g. vous, Sie, usted, formal أنتم/حضرتك). " +
      "Avoid slang and contractions where they would read as casual.",
  },
  {
    id: "informal",
    label: "Informal / casual",
    instruction:
      "Use an informal, casual, conversational register. Where the target language " +
      "distinguishes levels of address, use the familiar 'you' (e.g. tu, du, tú). " +
      "Everyday word choices and contractions are welcome.",
  },
];

const BY_ID = new Map(TONE_OPTIONS.map((t) => [t.id, t]));

/** Prompt instruction for a tone id; `""` for `default` or any unknown id. */
export function toneInstruction(id: string): string {
  return BY_ID.get(id as ToneId)?.instruction ?? "";
}
