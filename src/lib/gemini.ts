// Gemini (Google AI Studio) : facultatif. Il sert seulement à REGARDER les images des fonds vidéo (ni personne,
// ni construction, ni texte) et à accorder l'ambiance sonore à l'image. Il n'écrit jamais un verset, une traduction
// ou un hadith. Clé gratuite : https://aistudio.google.com/apikey → GEMINI_API_KEY dans .env.
// Sans clé, le kit fonctionne quand même : il n'utilise que des plans déjà vérifiés (data/plans-verifies.json).

const API = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Modèle utilisé : celui que Google recommande aux nouveaux projets (gratuit, images acceptées, réponse rapide).
 * Modifiable dans .env (GEMINI_MODEL) le jour où Google le remplace.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/** generateContent sur un modèle Gemini, avec la clé de .env (envoyée dans un en-tête, jamais dans l'adresse). */
export async function generateContent<T = unknown>(body: object, model = GEMINI_MODEL): Promise<T> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("Clé Gemini absente (GEMINI_API_KEY dans .env).");
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = (await res.text()).replaceAll(key, "***");
    let message = text.slice(0, 200);
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      // réponse non JSON : on garde le début du texte
    }
    throw new Error(`Gemini ${model} : HTTP ${res.status} ${message}`);
  }
  return (await res.json()) as T;
}
