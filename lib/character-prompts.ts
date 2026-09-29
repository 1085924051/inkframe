export type CharacterPromptInput = {
  name: string;
  role?: string;
  age?: string;
  description?: string;
  wardrobe?: string;
  accessories?: string;
  traits?: string;
  goal?: string;
};

export const CHARACTER_REFERENCE_NEGATIVE = "text, subtitle, watermark, logo, frame, collage, props covering the body, dramatic colored background, cluttered background, harsh shadow, cropped body, duplicate person, extra person, different face, different hairstyle, different body shape, inconsistent costume, missing clothing details, missing accessories, deformed hands, extra fingers, distorted anatomy, low detail";

const VIEW_DIRECTIVES: Record<string, string> = {
  front: "front-facing full-body view, standing neutral, arms relaxed, face clearly visible",
  back: "back-facing full-body view, show the back of the hairstyle, clothing construction and rear accessories",
  left: "left side profile full-body view, keep the same face structure, hairstyle, body proportions and costume",
  right: "right side profile full-body view, keep the same face structure, hairstyle, body proportions and costume",
  outfit: "front three-quarter outfit documentation view, clearly show fabric, seams, layers, shoes and silhouette",
  accessory: "accessory and costume detail board, show the important jewelry, bag, glasses, watch, buttons and fabric texture while keeping the same character identity",
};

export function buildCharacterReferencePrompt(input: CharacterPromptInput, directorDescriptor = "", view = "front") {
  const clean = (value?: string) => value && !["年龄待补充", "性格待补充"].includes(value.trim()) ? value.trim() : "";
  const age = clean(input.age);
  const traits = clean(input.traits);
  const facts = [
    `character name: ${input.name}`,
    input.role ? `narrative role: ${input.role}` : "",
    age ? `age: ${age}` : "",
    input.description ? `appearance and body: ${input.description}` : "",
    traits ? `personality and temperament: ${traits}` : "",
    input.goal ? `dramatic objective: ${input.goal}` : "",
    input.wardrobe ? `fixed wardrobe and clothing: ${input.wardrobe}` : "",
    input.accessories ? `important accessories: ${input.accessories}` : "",
  ].filter(Boolean).join("; ");
  const viewDirective = VIEW_DIRECTIVES[view] || `${view} view`;
  return [
    "production character reference sheet for a narrative video, designed for character identity consistency across shots and episodes",
    directorDescriptor ? `visual direction: ${directorDescriptor}` : "",
    "professional studio photography, seamless solid-color light gray background, clean chroma-friendly backdrop, soft even three-point lighting, neutral exposure, centered composition, no environment, no props, no text",
    "show the entire body from head to shoes, anatomically accurate, neutral pose, sharp facial features, natural skin and fabric texture",
    facts,
    viewDirective,
    "preserve exactly the same face, hair, skin tone, body proportions, wardrobe colors, garment construction, shoes and accessories in every view; this image is a continuity reference for later image-to-video generation",
  ].filter(Boolean).join(". ") + ".";
}
