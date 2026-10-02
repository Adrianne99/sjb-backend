// Builds the "Tuition Fee Options" PDF that the website's download button opens.
// The numbers come from the same place as the fee table (Settings → Tuition & fees),
// so the PDF always matches what the Accounting Office charges.
//
// Fonts: IBM Plex Sans (backend/assets/fonts, free OFL license). PDF's built-in
// fonts have no peso sign (₱), so we embed our own.
import path from "node:path";
import PDFDocument from "pdfkit";
import { SCHOOL_TIME_ZONE } from "../../config/constants";
import { peso, SCHOOL_LOCATION, SCHOOL_NAME } from "../email/templates/layout";
import { listPublicFees } from "./fee.service";

// The server always starts from the backend folder (npm start / npm run dev).
const ASSETS = path.resolve(process.cwd(), "assets");
const FONTS = {
  light: path.join(ASSETS, "fonts/IBMPlexSans-Light.ttf"),
  regular: path.join(ASSETS, "fonts/IBMPlexSans-Regular.ttf"),
  bold: path.join(ASSETS, "fonts/IBMPlexSans-SemiBold.ttf"),
};
const LOGO = path.join(ASSETS, "images/sjb-logo.png");

// School colors (same as the website).
const NAVY = "#132552";
const GOLD = "#e5b324";
const GOLD_DARK = "#8a6508";
const INK = "#1f2937";
const MUTED = "#6b7280";
const BORDER = "#e3e6ee";
const ROW_TINT = "#f6f7fb";

// A4 portrait, in points (1 pt = 1/72 inch).
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Table columns: [heading, width, alignment]. The widths add up to CONTENT_WIDTH. */
const MONEY_WIDTH = (CONTENT_WIDTH - 118 - 40) / 5;
const COLUMNS: Array<[string, number, "left" | "right"]> = [
  ["Course & year", 118, "left"],
  ["Units", 40, "right"],
  ["Down payment", MONEY_WIDTH, "right"],
  ["Prelim", MONEY_WIDTH, "right"],
  ["Midterm", MONEY_WIDTH, "right"],
  ["Final", MONEY_WIDTH, "right"],
  ["Total", MONEY_WIDTH, "right"],
];
const CELL_PADDING = 7;
const HEADER_HEIGHT = 26;
const ROW_HEIGHT = 36;

export const TUITION_PDF_FILENAME = "SJB-Tuition-Fee-Options.pdf";

/** Returns the finished PDF file as bytes. */
export async function buildTuitionPdf(): Promise<Buffer> {
  const { schedules, crossEnrollmentFee } = await listPublicFees();
  const college = schedules.filter((row) => row.annualTuition === null);
  const seniorHigh = schedules.find((row) => row.annualTuition !== null);
  const sample = college[0];

  // margin 0: we place everything ourselves, so pdfkit never adds pages on its own.
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    info: { Title: "Tuition Fee Options", Author: SCHOOL_NAME, Subject: "Tuition fee options" },
  });
  doc.registerFont("light", FONTS.light);
  doc.registerFont("regular", FONTS.regular);
  doc.registerFont("bold", FONTS.bold);

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // --- Letterhead -------------------------------------------------------------
  doc.image(LOGO, MARGIN, MARGIN, { height: 52 });
  doc.font("bold").fontSize(13).fillColor(NAVY).text(SCHOOL_NAME, MARGIN + 64, MARGIN + 12, { width: CONTENT_WIDTH - 64 });
  doc.font("regular").fontSize(9).fillColor(MUTED).text(SCHOOL_LOCATION, MARGIN + 64, MARGIN + 31);
  doc.rect(MARGIN, MARGIN + 66, CONTENT_WIDTH, 2).fill(GOLD);

  // --- Title ------------------------------------------------------------------
  let y = MARGIN + 88;
  doc.font("light").fontSize(24).fillColor(NAVY).text("Tuition fee options", MARGIN, y);
  y += 36;
  const intro = `College fees are per term${
    sample ? ` (${peso(sample.ratePerUnit)} per unit, including the ${peso(sample.miscFee)} miscellaneous fee)` : ""
  }. Units may vary depending on the semester taken.`;
  doc.font("regular").fontSize(10).fillColor(MUTED).text(intro, MARGIN, y, { width: CONTENT_WIDTH, lineGap: 2 });
  y = doc.y + 18;

  // --- College table ----------------------------------------------------------
  /** Writes one line of text that ends at `right` (measured, so it never wraps). */
  const rightAligned = (text: string, right: number, top: number, characterSpacing = 0) => {
    doc.text(text, right - doc.widthOfString(text, { characterSpacing }), top, { characterSpacing, lineBreak: false });
  };

  const drawHeader = () => {
    doc.rect(MARGIN, y, CONTENT_WIDTH, HEADER_HEIGHT).fill(NAVY);
    let x = MARGIN;
    doc.font("bold").fontSize(6.8).fillColor("#ffffff");
    for (const [label, width, align] of COLUMNS) {
      if (align === "left") doc.text(label.toUpperCase(), x + CELL_PADDING, y + 9.5, { characterSpacing: 0.6, lineBreak: false });
      else rightAligned(label.toUpperCase(), x + width - CELL_PADDING, y + 9.5, 0.6);
      x += width;
    }
    y += HEADER_HEIGHT;
  };

  if (college.length > 0) {
    drawHeader();
    college.forEach((row, index) => {
      // Many programs? Continue the table on a new page.
      if (y + ROW_HEIGHT > PAGE_HEIGHT - 200) {
        doc.addPage();
        y = MARGIN;
        drawHeader();
      }
      if (index % 2 === 1) doc.rect(MARGIN, y, CONTENT_WIDTH, ROW_HEIGHT).fill(ROW_TINT);

      const [course, units, ...money] = COLUMNS;
      doc.font("bold").fontSize(9.5).fillColor(NAVY).text(`${row.yearLevelLabel} ${row.programCode}`, MARGIN + CELL_PADDING, y + 7, { width: course[1] - CELL_PADDING * 2, lineBreak: false });
      doc.font("regular").fontSize(7.5).fillColor(MUTED).text(row.programName, MARGIN + CELL_PADDING, y + 20, { width: course[1] - CELL_PADDING * 2, lineBreak: false, ellipsis: true });

      let x = MARGIN + course[1];
      const cell = (value: string, width: number, bold = false) => {
        doc.font(bold ? "bold" : "regular").fontSize(9.5).fillColor(bold ? NAVY : INK);
        rightAligned(value, x + width - CELL_PADDING, y + 13);
        x += width;
      };
      cell(String(row.units), units[1]);
      const amounts = [row.downPayment, row.prelimPayment, row.midtermPayment, row.finalPayment, row.total];
      amounts.forEach((amount, i) => cell(peso(amount), money[i][1], i === amounts.length - 1));

      y += ROW_HEIGHT;
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(0.5).strokeColor(BORDER).stroke();
    });
    y += 28;
  }

  // --- Payment notes (2 × 2 grid) ---------------------------------------------
  const notes: Array<{ label: string; value: string; text: string }> = [];
  if (sample) {
    notes.push({ label: "Early bird", value: `Less ${peso(sample.earlyBirdDiscount)}`, text: "Pay in full 1 month before the start of the term." });
    notes.push({ label: "Cash payment", value: `Less ${peso(sample.cashDiscount)}`, text: "Pay in full up to the first day of classes." });
  }
  if (seniorHigh?.annualTuition != null) {
    notes.push({ label: "Senior High School", value: "Free with voucher", text: `Without a voucher: ${peso(seniorHigh.annualTuition)} for the whole school year (Grade 11–12).` });
  }
  notes.push({ label: "Cross enrollment", value: `${peso(crossEnrollmentFee)} per subject`, text: "For a 3-unit subject. Cash basis only." });

  const GAP = 28;
  const noteWidth = (CONTENT_WIDTH - GAP) / 2;
  for (let i = 0; i < notes.length; i += 2) {
    let rowBottom = y;
    notes.slice(i, i + 2).forEach((note, column) => {
      const x = MARGIN + column * (noteWidth + GAP);
      doc.moveTo(x, y).lineTo(x + noteWidth, y).lineWidth(0.5).strokeColor(BORDER).stroke();
      doc.font("bold").fontSize(7.5).fillColor(GOLD_DARK).text(note.label.toUpperCase(), x, y + 12, { characterSpacing: 1.2, lineBreak: false });
      doc.font("light").fontSize(15).fillColor(NAVY).text(note.value, x, y + 26, { width: noteWidth, lineBreak: false });
      doc.font("regular").fontSize(9).fillColor(MUTED).text(note.text, x, y + 48, { width: noteWidth, lineGap: 1.5 });
      rowBottom = Math.max(rowBottom, doc.y);
    });
    y = rowBottom + 20;
  }

  // --- Footer -----------------------------------------------------------------
  const footerY = PAGE_HEIGHT - MARGIN - 30;
  const today = new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: SCHOOL_TIME_ZONE }).format(new Date());
  doc.moveTo(MARGIN, footerY).lineTo(MARGIN + CONTENT_WIDTH, footerY).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc
    .font("regular")
    .fontSize(8)
    .fillColor(MUTED)
    .text("Fees may change. Please confirm the amounts with the Accounting Office before paying.", MARGIN, footerY + 10, { width: CONTENT_WIDTH, lineBreak: false });
  doc.text(`${SCHOOL_NAME} · As of ${today}`, MARGIN, footerY + 22, { width: CONTENT_WIDTH, lineBreak: false });

  doc.end();
  return finished;
}
