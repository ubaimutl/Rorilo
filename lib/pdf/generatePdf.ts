import { jsPDF } from "jspdf";

export type CoverLetterTemplate = "modern" | "editorial" | "banner" | "minimalist" | "creative" | "german_din";

export interface CoverLetterTemplateInfo {
  id: CoverLetterTemplate;
  name: string;
  tagline: string;
  description: string;
}

export const COVER_LETTER_TEMPLATES: CoverLetterTemplateInfo[] = [
  {
    id: "german_din",
    name: "DIN Tabular",
    tagline: "German Bold DIN & Two-Column Grid",
    description: "Ultra-bold Anschreiben header with a two-column contact metadata table and crisp black dividers.",
  },
  {
    id: "modern",
    name: "Modern Bold",
    tagline: "Clean Sans & Double Accent",
    description: "High-contrast sans-serif with right-aligned contact card and dual hairline dividers.",
  },
  {
    id: "editorial",
    name: "Editorial Serif",
    tagline: "Vogue Literary Elegance",
    description: "Classic serif typography with spaced uppercase subheader and boxed triple-column contact block.",
  },
  {
    id: "banner",
    name: "Executive Banner",
    tagline: "Navy Corporate Header",
    description: "Full-width navy corporate bar with crisp white contact info and bold centered header.",
  },
  {
    id: "minimalist",
    name: "Minimalist Badge",
    tagline: "Warm Espresso Date Badge",
    description: "Refined layout featuring a centered espresso date pill and centered recipient card.",
  },
  {
    id: "creative",
    name: "Creative Pastel",
    tagline: "Nordic Color Blocks & Script",
    description: "Architectural pastel color blocks with framed contact section and cursive signature styling.",
  },
];

export interface CoverLetterPdfData {
  candidateName: string;
  candidateTitle?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  candidateLocation?: string;
  candidateLinks?: string;
  companyName: string;
  companyAddress?: string;
  contactPerson?: string;
  jobTitle: string;
  date?: string;
  content: string;
  template?: CoverLetterTemplate;
}

function sanitizeContent(raw: string) {
  let text = (raw || "").trim();
  let subject = "";

  const lines = text.split("\n");
  const firstLine = lines[0]?.trim() || "";
  const subjectMatch = firstLine.match(/^(?:#+\s*)?(?:Betreff:|Subject:|Regarding:)\s*(.+)$/i);
  if (subjectMatch) {
    subject = subjectMatch[1].trim();
    text = lines.slice(1).join("\n").trim();
  }

  return { subject, body: text };
}

function isPdfContentGerman(data: CoverLetterPdfData) {
  const { subject, body } = sanitizeContent(data.content || "");
  const text = `${subject}\n${body}\n${data.jobTitle || ""}`.toLowerCase();

  if (/^\s*(dear|hello|hi)\b/i.test(body) || /\b(sincerely|best regards|i am applying|i would like to apply)\b/i.test(body)) {
    return false;
  }
  if (/^\s*(sehr geehrte|guten tag)\b/i.test(body) || /\b(mit freundlichen grüßen|ich bewerbe mich|hiermit bewerbe ich mich)\b/i.test(body)) {
    return true;
  }

  const germanSignals = [
    "bewerbung",
    "berufserfahrung",
    "kenntnisse",
    "tätigkeit",
    "aufgaben",
    "anforderungen",
    "kaufmännisch",
    "datenerfasser",
    "sachbearbeiter",
    "mitarbeiter",
    "deutsch",
    "m/w/d",
  ];
  const englishSignals = [
    "application",
    "apply",
    "experience",
    "responsibilities",
    "requirements",
    "qualifications",
    "skills",
    "team",
    "role",
    "position",
    "full-time",
    "part-time",
    "m/f/d",
  ];
  const germanScore = germanSignals.reduce((score, signal) => score + (text.includes(signal) ? 1 : 0), 0) + (/[äöüß]/i.test(text) ? 2 : 0);
  const englishScore = englishSignals.reduce((score, signal) => score + (text.includes(signal) ? 1 : 0), 0);

  return germanScore > englishScore;
}

interface BodyRenderOptions {
  bodyFontSize?: number;
  salutationFontSize?: number;
  signatureFontSize?: number;
  lineHeight?: number;
  paragraphGap?: number;
}

function renderBody(
  doc: jsPDF,
  body: string,
  margin: number,
  cw: number,
  ph: number,
  startY: number,
  candidateName: string,
  isGerman: boolean,
  fontFamily: "helvetica" | "times",
  rightScriptSignature: boolean = false,
  options: BodyRenderOptions = {}
) {
  let y = startY;
  const paragraphs = body.split(/\n\s*\n/);
  const bodyFontSize = options.bodyFontSize ?? 10;
  const salutationFontSize = options.salutationFontSize ?? 10;
  const signatureFontSize = options.signatureFontSize ?? 10.5;
  const lineHeight = options.lineHeight ?? 14.5;
  const paragraphGap = options.paragraphGap ?? 9;

  for (let i = 0; i < paragraphs.length; i++) {
    const trimmed = paragraphs[i].trim();
    if (!trimmed) continue;

    const isSalutation = i === 0 && /^(?:sehr\s+geehrte|dear|guten\s+tag|hello|hi)/i.test(trimmed);
    const isSignoff = /^(?:mit\s+freundlichen|sincerely|best\s+regards|herzliche|viele\s+grüße|warm\s+regards|yours\s+sincerely)/i.test(trimmed);

    if (isSalutation) {
      doc.setFont(fontFamily, "bold");
      doc.setFontSize(salutationFontSize);
      doc.setTextColor(15, 23, 42);
      const lines = doc.splitTextToSize(trimmed, cw);
      doc.text(lines, margin, y, { lineHeightFactor: 1.45 });
      y += lines.length * lineHeight + paragraphGap + 2;
    } else if (isSignoff) {
      const signoffLines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
      const greeting = signoffLines[0];
      const hasName = signoffLines.length > 1;
      const signer = hasName ? signoffLines.slice(1).join(" ") : candidateName || "";

      y += 8;
      doc.setFont(fontFamily, "normal");
      doc.setFontSize(bodyFontSize);
      doc.setTextColor(30, 41, 59);
      doc.text(greeting, margin, y);
      y += 24;

      if (rightScriptSignature) {
        // Render artistic italic signature on the right
        doc.setFont("times", "italic");
        doc.setFontSize(18);
        doc.setTextColor(15, 23, 42);
        doc.text(signer, doc.internal.pageSize.getWidth() - margin, y, { align: "right" });
        // And printed name on left
        doc.setFont(fontFamily, "normal");
        doc.setFontSize(bodyFontSize);
        doc.text(signer, margin, y);
      } else {
        doc.setFont(fontFamily, "bold");
        doc.setFontSize(signatureFontSize);
        doc.setTextColor(15, 23, 42);
        doc.text(signer, margin, y);
      }
      break;
    } else {
      doc.setFont(fontFamily, "normal");
      doc.setFontSize(bodyFontSize);
      doc.setTextColor(30, 41, 59);
      const lines = doc.splitTextToSize(trimmed, cw);
      const h = lines.length * lineHeight;
      if (y + h > ph - margin - 35) {
        doc.addPage();
        y = margin + 20;
      }
      doc.text(lines, margin, y, { lineHeightFactor: 1.45 });
      y += h + paragraphGap;
    }
  }

  // Footer for all pages
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const fy = ph - 24;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(candidateName || "", margin, fy);
    const pStr = isGerman ? `Seite ${p} von ${total}` : `Page ${p} of ${total}`;
    doc.text(pStr, doc.internal.pageSize.getWidth() - margin, fy, { align: "right" });
  }
}

// 1. Template: Modern Bold (Darian Mann style)
function renderTemplateModern(data: CoverLetterPdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 50;
  const cw = pw - margin * 2;
  const isGerman = isPdfContentGerman(data);

  // Big Bold Name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(15, 23, 42);
  doc.text((data.candidateName || "Candidate").toUpperCase(), margin, 58);

  // Subtitle
  let y = 74;
  if (data.candidateTitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(71, 85, 105);
    doc.text(data.candidateTitle, margin, y);
    y += 14;
  }

  // Right-aligned contact info
  const rx = pw - margin;
  let cy = 42;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  if (data.candidatePhone) {
    doc.text(data.candidatePhone, rx, cy, { align: "right" });
    cy += 12;
  }
  if (data.candidateEmail) {
    doc.text(data.candidateEmail, rx, cy, { align: "right" });
    cy += 12;
  }
  if (data.candidateLocation) {
    doc.text(data.candidateLocation, rx, cy, { align: "right" });
    cy += 12;
  }
  if (data.candidateLinks) {
    const l = data.candidateLinks
      .replace(/https?:\/\//g, "")
      .split(/[\s|•]+/)
      .filter(Boolean)
      .slice(0, 2)
      .join(" • ");
    doc.text(l, rx, cy, { align: "right" });
    cy += 12;
  }

  y = Math.max(y + 8, cy + 4);

  // Double Horizontal Rules (Darian Mann style)
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(1.4);
  doc.line(margin, y, rx, y);
  y += 3.5;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);
  doc.line(margin, y, rx, y);
  y += 24;

  // Recipient & Date
  const ry = y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(data.contactPerson || (isGerman ? "Personalabteilung" : "Hiring Manager"), margin, y);
  y += 13;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  doc.text(data.companyName || "Company", margin, y);
  y += 13;
  if (data.companyAddress) {
    doc.text(data.companyAddress, margin, y);
    y += 13;
  }

  // Date on right
  const dateStr =
    data.date ||
    new Date().toLocaleDateString(isGerman ? "de-DE" : "en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(dateStr, rx, ry, { align: "right" });

  y = Math.max(y + 14, ry + 36);

  // Subject line
  const { subject, body } = sanitizeContent(data.content);
  const subj =
    subject || (data.jobTitle ? `${isGerman ? "Bewerbung als" : "Application for"} ${data.jobTitle}` : "");
  if (subj) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    const subjectLines = doc.splitTextToSize(subj, cw);
    doc.text(subjectLines, margin, y, { lineHeightFactor: 1.25 });
    y += subjectLines.length * 15 + 18;
  }

  // Body
  renderBody(doc, body, margin, cw, ph, y, data.candidateName, isGerman, "helvetica", false, {
    bodyFontSize: 10.7,
    salutationFontSize: 10.8,
    signatureFontSize: 11,
    lineHeight: 15.8,
    paragraphGap: 11,
  });
  return doc;
}

// 2. Template: Editorial Serif (Chanchal Sharma style)
function renderTemplateEditorial(data: CoverLetterPdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 50;
  const cw = pw - margin * 2;
  const isGerman = isPdfContentGerman(data);

  // Huge Elegant Serif Name
  doc.setFont("times", "bold");
  doc.setFontSize(30);
  doc.setTextColor(15, 23, 42);
  const nameLines = doc.splitTextToSize(data.candidateName || "Candidate", cw * 0.7);
  doc.text(nameLines, margin, 54);
  let y = 54 + (nameLines.length - 1) * 28 + 20;

  // Spaced Uppercase Subtitle
  if (data.candidateTitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const spaced = data.candidateTitle.toUpperCase().split("").join(" ");
    doc.text(spaced.slice(0, 50), margin, y);
    y += 18;
  }

  // Triple-Column Boxed Contact Bar (framed by top & bottom lines)
  y += 4;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.75);
  doc.line(margin, y, pw - margin, y);
  y += 14;

  doc.setFont("times", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const col1 = data.candidateEmail || "";
  const col2 = data.candidatePhone || "";
  const col3 = data.candidateLocation || "";
  doc.text(col1, margin, y);
  doc.text(col2, pw / 2, y, { align: "center" });
  doc.text(col3, pw - margin, y, { align: "right" });
  y += 8;
  doc.line(margin, y, pw - margin, y);
  y += 24;

  // TO HIRING MANAGER header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  const toHeader = isGerman ? "AN DIE PERSONALABTEILUNG" : "TO HIRING MANAGER";
  const spacedTo = toHeader.split("").join(" ");
  doc.text(spacedTo, margin, y);
  y += 14;

  doc.setFont("times", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(data.companyName || "Company", margin, y);
  y += 13;
  if (data.companyAddress) {
    doc.text(data.companyAddress, margin, y);
    y += 13;
  }

  // Divider line
  y += 6;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 70, y);
  y += 22;

  // Body
  const { subject, body } = sanitizeContent(data.content);
  renderBody(doc, body, margin, cw, ph, y, data.candidateName, isGerman, "times", false, {
    bodyFontSize: 11.2,
    salutationFontSize: 11.2,
    signatureFontSize: 11.5,
    lineHeight: 16.4,
    paragraphGap: 12,
  });
  return doc;
}

// 3. Template: Executive Banner (Corporate Navy Bar)
function renderTemplateBanner(data: CoverLetterPdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 50;
  const cw = pw - margin * 2;
  const isGerman = isPdfContentGerman(data);

  // Large Centered Name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(15, 23, 42);
  doc.text((data.candidateName || "Candidate").toUpperCase(), pw / 2, 54, { align: "center" });

  // Full-Width Navy Banner
  const bannerY = 72;
  const bannerH = 26;
  doc.setFillColor(15, 59, 102); // Rich Navy #0F3B66
  doc.rect(0, bannerY, pw, bannerH, "F");

  // Banner Contact Info (3 columns in white)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  const bcol1 = data.candidateLocation ? `| Ort: ${data.candidateLocation}` : "";
  const bcol2 = data.candidatePhone ? `| Tel: ${data.candidatePhone}` : "";
  const bcol3 = data.candidateEmail ? `| Email: ${data.candidateEmail}` : "";
  doc.text(bcol1, margin, bannerY + 16);
  doc.text(bcol2, pw / 2, bannerY + 16, { align: "center" });
  doc.text(bcol3, pw - margin, bannerY + 16, { align: "right" });

  let y = bannerY + bannerH + 30;

  // Date
  const dateStr =
    data.date ||
    new Date().toLocaleDateString(isGerman ? "de-DE" : "en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(dateStr, margin, y);
  y += 20;

  // Recipient
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(data.contactPerson || (isGerman ? "Personalabteilung" : "Hiring Manager"), margin, y);
  y += 13;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  doc.text(data.companyName || "Company", margin, y);
  y += 22;

  // Subject
  const { subject, body } = sanitizeContent(data.content);
  const subj =
    subject || (data.jobTitle ? `${isGerman ? "Bewerbung als" : "Application for"} ${data.jobTitle}` : "");
  if (subj) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(15, 59, 102);
    const subjectLines = doc.splitTextToSize(subj, cw);
    doc.text(subjectLines, margin, y, { lineHeightFactor: 1.25 });
    y += subjectLines.length * 15 + 18;
  }

  // Body
  renderBody(doc, body, margin, cw, ph, y, data.candidateName, isGerman, "helvetica", false, {
    bodyFontSize: 10.7,
    salutationFontSize: 10.8,
    signatureFontSize: 11,
    lineHeight: 15.8,
    paragraphGap: 11,
  });
  return doc;
}

// 4. Template: Minimalist Badge (Jason Wilson style)
function renderTemplateMinimalist(data: CoverLetterPdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 54;
  const cw = pw - margin * 2;
  const isGerman = isPdfContentGerman(data);

  // Top Left: Name & Location
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text(data.candidateName || "Candidate", margin, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(100, 116, 139);
  if (data.candidateLocation) doc.text(data.candidateLocation, margin, 59);

  // Top Right: Phone & Email
  const rx = pw - margin;
  if (data.candidatePhone) doc.text(data.candidatePhone, rx, 46, { align: "right" });
  if (data.candidateEmail) doc.text(data.candidateEmail, rx, 59, { align: "right" });

  let y = 74;

  // Subtle divider
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.75);
  doc.line(margin, y, rx, y);
  y += 18;

  // Centered Date Badge (Warm Espresso Pill)
  const dateStr =
    data.date ||
    new Date().toLocaleDateString(isGerman ? "de-DE" : "en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const badgeW = doc.getTextWidth(dateStr) + 24;
  const badgeH = 18;
  const badgeX = (pw - badgeW) / 2;
  doc.setFillColor(110, 85, 75); // Warm Espresso/Brown
  doc.roundedRect(badgeX, y, badgeW, badgeH, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(dateStr, pw / 2, y + 12, { align: "center" });
  y += badgeH + 20;

  // Centered Recipient Card
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text(data.companyName || "Company", pw / 2, y, { align: "center" });
  y += 15;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(100, 116, 139);
  if (data.contactPerson) {
    doc.text(data.contactPerson, pw / 2, y, { align: "center" });
    y += 13;
  }
  if (data.jobTitle) {
    doc.text(data.jobTitle, pw / 2, y, { align: "center" });
    y += 13;
  }

  // Divider
  y += 8;
  doc.line(margin, y, rx, y);
  y += 24;

  // Body
  const { subject, body } = sanitizeContent(data.content);
  renderBody(doc, body, margin, cw, ph, y, data.candidateName, isGerman, "helvetica", false, {
    bodyFontSize: 10.8,
    salutationFontSize: 10.8,
    signatureFontSize: 11,
    lineHeight: 16,
    paragraphGap: 11,
  });
  return doc;
}

// 5. Template: Creative Pastel (Ella Elmer style)
function renderTemplateCreative(data: CoverLetterPdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 52;
  const cw = pw - margin * 2;
  const isGerman = isPdfContentGerman(data);

  // Creative Pastel Geometric Accents (Ella Elmer style)
  // 1. Top-Left Soft Sage Block
  doc.setFillColor(209, 231, 221); // #D1E7DD Soft Sage
  doc.rect(0, 0, 45, 120, "F");

  // 2. Top-Right Soft Blush Coral Block
  doc.setFillColor(248, 215, 218); // #F8D7DA Soft Blush
  doc.rect(pw - 120, 0, 120, 24, "F");

  // 3. Bottom-Right Warm Sand Block
  doc.setFillColor(212, 184, 150); // #D4B896 Warm Sand
  doc.rect(pw - 110, ph - 40, 110, 40, "F");

  // Centered Bold Serif Name
  doc.setFont("times", "bold");
  doc.setFontSize(24);
  doc.setTextColor(15, 23, 42);
  doc.text(data.candidateName || "Candidate", pw / 2, 58, { align: "center" });

  let y = 84;
  // Framing Line 1
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.75);
  doc.line(margin, y, pw - margin, y);
  y += 18;

  // Recipient on Left, Candidate on Right
  const blockY = y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text(data.contactPerson || (isGerman ? "Personalabteilung" : "Hiring Manager"), margin, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(data.companyName || "Company", margin, y);
  y += 12;

  // Right side candidate address
  const rx = pw - margin;
  let ry = blockY;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  if (data.candidateLocation) {
    doc.text(data.candidateLocation, rx, ry, { align: "right" });
    ry += 12;
  }
  if (data.candidateEmail) {
    doc.text(data.candidateEmail, rx, ry, { align: "right" });
    ry += 12;
  }
  if (data.candidatePhone) {
    doc.text(data.candidatePhone, rx, ry, { align: "right" });
    ry += 12;
  }

  y = Math.max(y + 8, ry + 8);

  // Framing Line 2
  doc.line(margin, y, rx, y);
  y += 24;

  // Subject
  const { subject, body } = sanitizeContent(data.content);
  const subj =
    subject || (data.jobTitle ? `${isGerman ? "Bewerbung als" : "Application for"} ${data.jobTitle}` : "");
  if (subj) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.2);
    doc.setTextColor(15, 23, 42);
    const subjectLines = doc.splitTextToSize(subj, cw);
    doc.text(subjectLines, margin, y, { lineHeightFactor: 1.25 });
    y += subjectLines.length * 15 + 17;
  }

  // Body with italic script signature on the right
  renderBody(doc, body, margin, cw, ph, y, data.candidateName, isGerman, "helvetica", true, {
    bodyFontSize: 10.7,
    salutationFontSize: 10.8,
    signatureFontSize: 11,
    lineHeight: 15.8,
    paragraphGap: 11,
  });
  return doc;
}

// 6. Template: DIN Tabular / Anschreiben (German Grid Style)
function renderTemplateGermanDin(data: CoverLetterPdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 52;
  const cw = pw - margin * 2;
  const isGerman = isPdfContentGerman(data);

  // 1. Giant Ultra-Bold Header: "ANSCHREIBEN"
  doc.setFont("helvetica", "bold");
  doc.setFontSize(33);
  doc.setTextColor(17, 24, 39); // #111827
  const titleText = isGerman ? "ANSCHREIBEN" : "COVER LETTER";
  doc.text(titleText, margin, 74);

  // 2. Dual-Column Metadata Table
  const col1Left = margin;
  const col1Right = margin + 210; // width = 210pt
  const col2Left = margin + 250;  // gap = 40pt
  const col2Right = pw - margin;  // width = 243pt

  let leftY = 112;
  const rowHeight = 22;

  doc.setDrawColor(17, 24, 39);
  doc.setLineWidth(1.2);

  const drawRow = (label: string, value: string, leftX: number, rightX: number, y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(17, 24, 39);
    doc.text(label.toUpperCase(), leftX, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(31, 41, 55);
    doc.text(value, rightX, y, { align: "right" });

    doc.line(leftX, y + 5.5, rightX, y + 5.5);
  };

  // Left Column (Candidate / Sender)
  const candidateRows: [string, string][] = [
    [isGerman ? "VON" : "FROM", data.candidateName || ""],
    [isGerman ? "MAIL" : "EMAIL", data.candidateEmail || ""],
    [isGerman ? "TELEFON" : "PHONE", data.candidatePhone || ""],
    [isGerman ? "ORT" : "LOCATION", data.candidateLocation || ""],
  ].filter(([_, val]) => Boolean(val?.trim())) as [string, string][];

  candidateRows.forEach(([lbl, val]) => {
    drawRow(lbl, val, col1Left, col1Right, leftY);
    leftY += rowHeight;
  });

  // Candidate Links (WEB)
  const links = (data.candidateLinks || "")
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (links.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(17, 24, 39);
    doc.text(isGerman ? "WEB" : "LINKS", col1Left, leftY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(31, 41, 55);

    let curLinkY = leftY;
    links.slice(0, 2).forEach((link) => {
      doc.text(link, col1Right, curLinkY, { align: "right" });
      curLinkY += 12;
    });

    const underlineY = curLinkY - 12 + 5.5;
    doc.line(col1Left, underlineY, col1Right, underlineY);
    leftY = underlineY + 16;
  }

  // Right Column (Recipient / Company & Date)
  let rightY = 112;
  const companyName = data.companyName || (isGerman ? "Unternehmen" : "Company");
  const contact =
    data.contactPerson ||
    (isGerman ? `${companyName}-Team` : `${companyName} Hiring Team`);

  const formattedDate =
    data.date ||
    new Date().toLocaleDateString(isGerman ? "de-DE" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const cityDate = data.candidateLocation
    ? `${data.candidateLocation.split(/[,/]/)[0].trim()}, ${formattedDate}`
    : formattedDate;

  const recipientRows: [string, string][] = [
    [isGerman ? "AN" : "TO", companyName],
    [isGerman ? "TEAM" : "ATTN", contact],
    [isGerman ? "DATUM" : "DATE", cityDate],
  ].filter(([_, val]) => Boolean(val?.trim())) as [string, string][];

  recipientRows.forEach(([lbl, val]) => {
    drawRow(lbl, val, col2Left, col2Right, rightY);
    rightY += rowHeight;
  });

  // 3. Subject Line
  const tableBottom = Math.max(leftY, rightY);
  let subjY = Math.max(tableBottom + 40, 245);

  const { subject, body } = sanitizeContent(data.content);
  const subjectText =
    subject ||
    (data.jobTitle
      ? `${isGerman ? "Bewerbung als" : "Application for"} ${data.jobTitle}`
      : "");

  if (subjectText) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(17, 24, 39);
    doc.text(subjectText, margin, subjY);
    subjY += 28;
  }

  // 4. Body
  renderBody(doc, body, margin, cw, ph, subjY, data.candidateName, isGerman, "helvetica");
  return doc;
}

export function createCoverLetterDoc(data: CoverLetterPdfData): jsPDF {
  const template = data.template || "german_din";
  switch (template) {
    case "german_din":
      return renderTemplateGermanDin(data);
    case "editorial":
      return renderTemplateEditorial(data);
    case "banner":
      return renderTemplateBanner(data);
    case "minimalist":
      return renderTemplateMinimalist(data);
    case "creative":
      return renderTemplateCreative(data);
    case "modern":
    default:
      return renderTemplateModern(data);
  }
}

export function generateCoverLetterPdfBlob(data: CoverLetterPdfData): Blob {
  const doc = createCoverLetterDoc(data);
  return doc.output("blob");
}

export function downloadCoverLetterPdf(data: CoverLetterPdfData, filename?: string): void {
  const doc = createCoverLetterDoc(data);
  const cleanName = (data.companyName || "Application")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  doc.save(filename || `Cover_Letter_${cleanName}.pdf`);
}

export interface TrackerPdfApplication {
  status: string;
  title: string;
  company: string;
  location?: string | null;
  updatedAt?: string | Date | null;
  appliedAt?: string | Date | null;
  score?: number | null;
}

export interface TrackerPdfOptions {
  from?: string;
  to?: string;
  statusLabels: Record<string, string>;
  title?: string;
}

function formatTrackerDate(value?: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fitPdfLine(doc: jsPDF, line: string, width: number): string {
  if (doc.getTextWidth(line) <= width) return line;
  let fitted = line.trim();
  while (fitted.length > 1 && doc.getTextWidth(`${fitted}...`) > width) {
    fitted = fitted.slice(0, -1).trimEnd();
  }
  return fitted.length > 1 ? `${fitted}...` : "";
}

export function createTrackerApplicationsDoc(
  applications: TrackerPdfApplication[],
  options: TrackerPdfOptions
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 36;
  const headerTop = 34;
  const tableTop = 92;
  const rowPadY = 7;
  const lineHeight = 10;
  const minRowHeight = 28;
  const columns = [
    { key: "status", label: "Status", x: margin, w: 72 },
    { key: "title", label: "Role", x: margin + 78, w: 152 },
    { key: "company", label: "Company", x: margin + 236, w: 118 },
    { key: "location", label: "Location", x: margin + 360, w: 86 },
    { key: "date", label: "Date", x: margin + 452, w: 58 },
    { key: "score", label: "Score", x: margin + 516, w: 36 },
  ] as const;
  const tableRight = pw - margin;
  const sorted = [...applications].sort((a, b) => {
    const statusA = options.statusLabels[a.status] || a.status;
    const statusB = options.statusLabels[b.status] || b.status;
    if (statusA !== statusB) return statusA.localeCompare(statusB);
    const dateA = new Date(a.appliedAt || a.updatedAt || 0).getTime();
    const dateB = new Date(b.appliedAt || b.updatedAt || 0).getTime();
    return dateB - dateA;
  });

  function rangeText() {
    return [
      options.from ? `From ${formatTrackerDate(options.from)}` : null,
      options.to ? `To ${formatTrackerDate(options.to)}` : null,
    ]
      .filter(Boolean)
      .join("  ") || "All tracked applications";
  }

  function drawHeader(page: number) {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pw, ph, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(options.title || "Application tracker", margin, headerTop);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(rangeText(), margin, headerTop + 16);
    doc.text(`Page ${page}`, pw - margin, headerTop, { align: "right" });

    doc.setDrawColor(203, 213, 225);
    doc.line(margin, tableTop - 14, tableRight, tableTop - 14);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, tableTop - 12, tableRight - margin, 22, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    columns.forEach((column) => doc.text(column.label, column.x, tableTop + 2));
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, tableTop + 10, tableRight, tableTop + 10);
  }

  function valueFor(app: TrackerPdfApplication, key: (typeof columns)[number]["key"]) {
    if (key === "status") return options.statusLabels[app.status] || app.status;
    if (key === "title") return app.title;
    if (key === "company") return app.company;
    if (key === "location") return app.location || "";
    if (key === "date") return formatTrackerDate(app.appliedAt || app.updatedAt);
    if (key === "score") return app.score === null || app.score === undefined ? "" : `${app.score}%`;
    return "";
  }

  let page = 1;
  let y = tableTop + 28;
  drawHeader(page);

  sorted.forEach((app, index) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    const wrapped = columns.map((column) => doc.splitTextToSize(valueFor(app, column.key), column.w) as string[]);
    const rowHeight = Math.max(minRowHeight, rowPadY * 2 + Math.max(...wrapped.map((lines) => lines.length)) * lineHeight);

    if (y + rowHeight > ph - margin) {
      doc.addPage("a4", "portrait");
      page += 1;
      y = tableTop + 28;
      drawHeader(page);
    }

    if (index % 2 === 0) {
      doc.setFillColor(250, 252, 255);
      doc.rect(margin, y - rowPadY, tableRight - margin, rowHeight, "F");
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + rowHeight - rowPadY, tableRight, y + rowHeight - rowPadY);

    wrapped.forEach((lines, colIndex) => {
      const column = columns[colIndex];
      const isPrimary = column.key === "title";
      doc.setFont("helvetica", isPrimary ? "bold" : "normal");
      doc.setFontSize(isPrimary ? 7.8 : 7.4);
      doc.setTextColor(isPrimary ? 15 : 71, isPrimary ? 23 : 85, isPrimary ? 42 : 105);
      const fittedLines = lines.slice(0, 3).map((line) => fitPdfLine(doc, line, column.w));
      doc.text(fittedLines, column.x, y, { lineHeightFactor: 1.25 });
    });

    y += rowHeight;
  });

  return doc;
}

export function downloadTrackerApplicationsPdf(
  applications: TrackerPdfApplication[],
  options: TrackerPdfOptions,
  filename = "Rorilo_Tracker.pdf"
): void {
  const doc = createTrackerApplicationsDoc(applications, options);
  doc.save(filename);
}
