export interface Reciter {
  slug: string;
  /** Identifiant quran.com (api.qurancdn.com) : audio de la sourate + minutage mot à mot. */
  qdcId: number;
  name: string;
  nameAr: string;
  style: "Murattal" | "Mujawwad";
}

// Tous ces récitateurs ont un minutage mot à mot vérifié sur quran.com.
export const RECITERS: Reciter[] = [
  { slug: "yasser", qdcId: 97, name: "Yasser Al-Dosari", nameAr: "ياسر الدوسري", style: "Murattal" },
  { slug: "alafasy", qdcId: 7, name: "Mishary Rashid Alafasy", nameAr: "مشاري راشد العفاسي", style: "Murattal" },
  { slug: "sudais", qdcId: 3, name: "Abdur-Rahman As-Sudais", nameAr: "عبد الرحمن السديس", style: "Murattal" },
  { slug: "shuraim", qdcId: 10, name: "Saud Ash-Shuraim", nameAr: "سعود الشريم", style: "Murattal" },
  { slug: "minshawi", qdcId: 9, name: "Mohamed Siddiq Al-Minshawi", nameAr: "محمد صديق المنشاوي", style: "Murattal" },
  { slug: "husary", qdcId: 6, name: "Mahmoud Khalil Al-Husary", nameAr: "محمود خليل الحصري", style: "Murattal" },
  { slug: "abdulbasit", qdcId: 2, name: "Abdul Basit Abdul Samad", nameAr: "عبد الباسط عبد الصمد", style: "Murattal" },
  { slug: "abdulbasit-mujawwad", qdcId: 1, name: "Abdul Basit Abdul Samad", nameAr: "عبد الباسط عبد الصمد", style: "Mujawwad" },
  { slug: "shatri", qdcId: 4, name: "Abu Bakr Ash-Shatri", nameAr: "أبو بكر الشاطري", style: "Murattal" },
  { slug: "rifai", qdcId: 5, name: "Hani Ar-Rifai", nameAr: "هاني الرفاعي", style: "Murattal" },
  { slug: "tunaiji", qdcId: 161, name: "Khalifa Al-Tunaiji", nameAr: "خليفة الطنيجي", style: "Murattal" },
];

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Récitateur par son identifiant (« yasser ») ou par son nom, même approximatif (« Yasser Al-Dosari », « dosari »). */
export function getReciter(query: string): Reciter {
  const exact = RECITERS.find((r) => r.slug === query);
  if (exact) return exact;
  const q = normalize(query);
  const byName = q ? RECITERS.filter((r) => normalize(`${r.slug} ${r.name} ${r.style}`).includes(q) || q.split(" ").every((w) => normalize(`${r.slug} ${r.name}`).split(" ").some((n) => n.startsWith(w)))) : [];
  if (byName.length) return byName[0];
  const known = RECITERS.map((r) => `${r.slug} (${r.name})`).join(", ");
  throw new Error(`Récitateur inconnu « ${query} ». Disponibles : ${known}`);
}
