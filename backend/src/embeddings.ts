import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const LEGAL_CONTRACT_OUTPUT_RULES = `
Format izlaza za ugovor (OBAVEZNO):
- Čist tekst pravnog dokumenta: bez Markdown-a (zabrana *, **, #, kod blokova, liste zvezdicama).
- Struktura (obavezni raspored):
  1) Naslov ugovora velikim slovima (npr. „UGOVOR“ pa u sledećem redu „O ...“).
  2) Uvodna identifikacija ugovornih strana (mesto, datum, puni podaci strana i zastupnika).
  3) Razrada kroz članove sa posebnim redom „Član 1.“, „Član 2.“ itd. (svaki član počinje tim naslovom).
  4) Završne odredbe (trajanje, izmene/aneksi, rešavanje sporova, primenjivo pravo, broj primeraka).
  5) Potpisni blok za obe ugovorne strane.
- Naslovi članova pišu se tačno kao „Član X.“ (bez dodatnog teksta u istoj liniji).
- Početni blok ugovora oblikuj ovako (uz popunu poznatih podataka, a nepoznato ostavi kao [DOPUNITI: ...]):
  Zaključen dana [DOPUNITI: datum] godine u [DOPUNITI: mesto] između:
  1. [strana 1 podaci] (dalje: [uloga]), i
  2. [strana 2 podaci] (dalje: [uloga]).
  Ugovorne strane su se sporazumele o sledećem:
- Akapit (uvučenje prvog reda stava) ne koristi tab simbole; koristi novi red za novi stav.
- Naglasak samo kroz formulaciju, ne kroz zvezdice.
- Jezik: srpski latinica, formalan pravni stil (Republika Srbija).
`;

export async function getEmbedding(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return res.data[0].embedding;
}

export async function askAI(
  question: string,
  context: string,
): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
Odgovaraj ISKLJUCIVO na osnovu dostavljenog teksta.
Ako odgovor nije pronadjen u tekstu, odgovori tacno: "Nisam nasao odgovor u dostavljenom dokumentu."
`,
      },
      {
        role: "user",
        content: `
Question: ${question}

Context:
${context}
`,
      },
    ],
  });

  return res.choices[0].message.content || "";
}

export async function analyzeContractWithLaws(
  contractText: string,
  lawContext: string,
): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
Ti si pravni analitičar i pratiš pravo Republike Srbije.
Analiziraj ugovor isključivo uzimajući u obzir dostavljeni kontekst zakona i propisa (iz baze dokumenata).
Pravila:
- Piši na srpskom jeziku. Koristi istu ćirilično/latiničnu varijantu kao i tekst ugovora ako je ocigledna; inače koristi srpsku latinicu.
- Strukturiraj odgovor sa naslovima: 1) Kratak pregled predmeta ugovora, 2) Ključne obaveze i rokovi, 3) Pravna osnova (poveži relevatne delove sa izvorima iz konteksta propisa — nemoj izmišljati brojeve članova ako nisu u kontekstu), 4) Rizici, nedostaci i predlozi poboljšanja, 5) Lista stvari koje treba dodatno proveriti kod advokata ili nadležnog organa.
- Ako kontekst ne pokriva određenu oblast, eksplicitno reci da iz baze nema dovoljno podataka i šta treba dodatno istražiti.
- Ne tvrdi da je nešto „zakonski obavezno“ ako to ne proizlazi iz konteksta.
Na kraju jedna rečenica: analiza je informativna i ne predstavlja zamenik stručnog pravnog saveta.
`,
      },
      {
        role: "user",
        content: `
TEKST UGOVORA:

${contractText}

---

IZVUCI IZ POZITIVNOG PRAVA (KONTEKST IZ BAZE):

${lawContext}
`,
      },
    ],
  });

  return res.choices[0].message.content || "";
}

export async function generateContractDraft(
  contractType: string,
  partyDetails: string,
  lawContext: string,
): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
Ti si pravnik koji sastavlja nacrte ugovora prema zakonodavstvu Republike Srbije.
Koristi isključivo kontekst propisa iz baze kao pravnu osnovu za obavezne elemente i formulacije gde je primenljivo.
${LEGAL_CONTRACT_OUTPUT_RULES}
Pravila sadržaja:
- Izlaz mora biti kompletan tekst nacrta ugovora na srpskom jeziku (latinica), sa članovima „Član 1.“, „Član 2.“ itd.
- Uključi tipične elemente za datu vrstu ugovora (ugovorne strane, predmet, cena/rokovnik, obaveze, raskid, rešavanje sporova, primenjivo pravo, potpisi).
- Za vizuelno urednu strukturu: neka „Član X.“ bude samostalna linija, a sadržaj člana ispod u zasebnim pasusima.
- Uvodni deo pre „Član 1.“ obavezno napiši u obrascu „Zaključen dana ... između: 1. ... 2. ... Ugovorne strane su se sporazumele o sledećem:“.
- Gde norma iz konteksta traži određeni element, uključi ga i po mogućnosti napomeni u zagradi na koji propis se oslanjaš (bez izmišljanja brojeva članova zakona).
- Ako kontekst ne sadrži dovoljno podataka za određenu oblast, ostavi jasne oznake poput [DOPUNITI: …] umesto izmišljanja.
- Na početku kratko (jedna do tri rečenice) navedi šta je predmet i koji podaci su pretpostavljeni iz korisničkog opisa.
Na kraju jedna rečenica da je reč o nacrtu za pravnu proveru pre potpisivanja.
`,
      },
      {
        role: "user",
        content: `
VRSTA UGOVORA: ${contractType}

PODACI O STRANAMA I USLOVIMA (slobodan opis od korisnika):

${partyDetails}

---

KONTEKST PROPISA (REPUBLIKA SRBIJA):

${lawContext}
`,
      },
    ],
  });

  return res.choices[0].message.content || "";
}

export async function refineContractDraftLLM(
  currentDraft: string,
  instruction: string,
  lawContext: string,
  contractType: string,
): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
Ti si pravnik u Republici Srbiji i doraduješ postojeći nacrt ugovora na osnovu korisničkog uputstva.
Imati ćeš ceo trenutni tekst ugovora i instrukciju šta da izmeniš, dodaš ili skratiš.
${LEGAL_CONTRACT_OUTPUT_RULES}
Pravila izmene:
- Primeni SAMO ono što korisnik traži u instrukciji; ako je nejasno, razuman pravni izbor uz objašnjenje u jednoj rečenici na kraju pod „Napomena za strane.“ (opciono).
- Sačuvaj ostatak strukture i numeraciju članova ako instrukcija ne traži drugačije.
- Prilikom dopune koristi kontekst propisa kada je relevantno; nemoj izmišljati citate zakona.
- Vrati CEOPUN tekst ugovora posle dorade (ne samo izmenjene delove).
- Ako početni blok nije u standardnom obliku (datum/mesto, „između“, strane 1 i 2, rečenica „Ugovorne strane su se sporazumele o sledećem:“), uskladi ga u tom obliku.
`,
      },
      {
        role: "user",
        content: `
VRSTA UGOVORA (referenca): ${contractType}

UPUTSTVO ZA IZMENU / DORADU:

${instruction}

---

TRENUTNI TEKST UGOVORA:

${currentDraft}

---

KONTEKST PROPISA (REPUBLIKA SRBIJA):

${lawContext}
`,
      },
    ],
  });

  return res.choices[0].message.content || "";
}
