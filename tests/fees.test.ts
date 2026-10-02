import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "../src/generated/prisma/client";
import { buildFeeLines, buildPaymentSchedule, termTotal, type FeeBreakdown } from "../src/services/fees/fee-calculator";
import { app, CREDENTIALS, findStudentId, loginAs, type TestAgent } from "./helpers";

// The school's "Tuition Fee Options" (₱320/unit + ₱2,500 misc).
const firstYearIT: FeeBreakdown = {
  units: 23,
  ratePerUnit: 320,
  miscFee: 2500,
  downPayment: 2000,
  prelimPayment: 2870,
  midtermPayment: 2870,
  earlyBirdDiscount: 1000,
  cashDiscount: 500,
  annualTuition: null,
};

const sum = (lines: ReturnType<typeof buildFeeLines>) => lines.reduce((total, line) => total + Number(line.amount), 0);

describe("Tuition fee rules (calculator)", () => {
  it("matches the school's fee matrix", () => {
    expect(termTotal(firstYearIT)).toBe(9860);
    expect(termTotal({ ...firstYearIT, units: 24 })).toBe(10180); // 2nd Year IT
    expect(termTotal({ ...firstYearIT, units: 21 })).toBe(9220); // 2nd Year HRS
    expect(sum(buildFeeLines(firstYearIT, "INSTALLMENT"))).toBe(9860);
    expect(sum(buildFeeLines(firstYearIT, "EARLY_BIRD"))).toBe(8860);
    expect(sum(buildFeeLines(firstYearIT, "CASH"))).toBe(9360);
  });

  it("splits installments: down, prelim, midterm, final = the rest", () => {
    const schedule = buildPaymentSchedule("INSTALLMENT", firstYearIT, new Prisma.Decimal(9860), new Prisma.Decimal(3000));
    expect(schedule.map((part) => part.amount)).toEqual(["2000.00", "2870.00", "2870.00", "2120.00"]);
    expect(schedule.map((part) => part.status)).toEqual(["PAID", "PARTIAL", "DUE", "DUE"]);
    expect(schedule[1]).toMatchObject({ paid: "1000.00", remaining: "1870.00" });
  });

  it("shows extra charges (cross enrollment) separately and pays them first", () => {
    // 2nd Year IT (₱10,180) + ₱2,500 cross-enrollment fee; paid the fee + down payment.
    const secondYearIT = { ...firstYearIT, units: 24, prelimPayment: 2810, midtermPayment: 2810 };
    const schedule = buildPaymentSchedule("INSTALLMENT", secondYearIT, new Prisma.Decimal(12680), new Prisma.Decimal(4500));
    expect(schedule.map((part) => [part.amount, part.status])).toEqual([
      ["2500.00", "PAID"], // other charges
      ["2000.00", "PAID"], // down payment
      ["2810.00", "DUE"],
      ["2810.00", "DUE"],
      ["2560.00", "DUE"], // final, same as the fee table
    ]);
    // Early bird: one full payment of the discounted total.
    expect(buildPaymentSchedule("EARLY_BIRD", firstYearIT, new Prisma.Decimal(8860), new Prisma.Decimal(0)).map((part) => part.amount)).toEqual(["8860.00"]);
    // Voucher: nothing to pay.
    expect(buildPaymentSchedule("SHS_VOUCHER", null, new Prisma.Decimal(0), new Prisma.Decimal(0))).toEqual([]);
  });

  it("handles Senior High: ₱25,000 per year, free with voucher, charged once per year", () => {
    const shs: FeeBreakdown = { ...firstYearIT, units: 0, ratePerUnit: 0, miscFee: 0, downPayment: 0, prelimPayment: 0, midtermPayment: 0, annualTuition: 25000 };
    expect(sum(buildFeeLines(shs, "SHS_NO_VOUCHER"))).toBe(25000);
    expect(buildFeeLines(shs, "SHS_VOUCHER")).toEqual([]);
    expect(buildFeeLines(shs, "SHS_NO_VOUCHER", { annualAlreadyCharged: true })).toEqual([]);
  });
});

describe("Tuition fees in the system", () => {
  let staff: TestAgent;
  let admin: TestAgent;

  beforeAll(async () => {
    staff = await loginAs(CREDENTIALS.registrar);
    admin = await loginAs(CREDENTIALS.admin);
  });

  it("publishes the tuition fee options for the website", async () => {
    const response = await request(app).get("/api/fees/public");
    expect(response.status).toBe(200);
    const rows = response.body.data.schedules.map((row: { programCode: string; yearLevel: number; total: string; earlyBirdTotal: string; cashTotal: string }) => [
      `${row.programCode} ${row.yearLevel}`,
      row.total,
      row.earlyBirdTotal,
      row.cashTotal,
    ]);
    expect(rows).toEqual(
      expect.arrayContaining([
        ["IT 1", "9860.00", "8860.00", "9360.00"],
        ["HRS 1", "9860.00", "8860.00", "9360.00"],
        ["IT 2", "10180.00", "9180.00", "9680.00"],
        ["HRS 2", "9220.00", "8220.00", "8720.00"],
        ["SHS 11", "25000.00", "25000.00", "25000.00"],
      ]),
    );
    expect(response.body.data.crossEnrollmentFee).toBe("2500.00");
  });

  it("offers the same tuition fee options as a PDF file", async () => {
    const response = await request(app)
      .get("/api/fees/public/tuition-fees.pdf")
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("SJB-Tuition-Fee-Options.pdf");
    expect(Buffer.from(response.body).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("previews, applies (once) and schedules installment fees for an enrollment", async () => {
    const hannahId = await findStudentId(staff, "2026-0099"); // pending HRS 1st year, no fees yet
    const enrollmentId = (await staff.get(`/api/students/${hannahId}`)).body.data.currentEnrollment.id;

    const preview = await staff.post(`/api/enrollments/${enrollmentId}/apply-fees`, { plan: "INSTALLMENT", preview: true });
    expect(preview.body.data).toMatchObject({ total: "9860.00", planLabel: "Installment" });
    expect((await staff.get(`/api/enrollments/${enrollmentId}`)).body.data.assessments).toHaveLength(0); // preview saves nothing

    const applied = await staff.post(`/api/enrollments/${enrollmentId}/apply-fees`, { plan: "INSTALLMENT" });
    expect(applied.status).toBe(200);

    const detail = (await staff.get(`/api/enrollments/${enrollmentId}`)).body.data;
    expect(detail.balance.totalAssessed).toBe("9860.00");
    expect(detail.paymentSchedule.map((part: { label: string; amount: string }) => part.amount)).toEqual(["2000.00", "2870.00", "2870.00", "2120.00"]);

    const again = await staff.post(`/api/enrollments/${enrollmentId}/apply-fees`, { plan: "CASH" });
    expect(again.status).toBe(409);
  });

  it("counts an irregular student's extra subjects in the units for tuition", async () => {
    const angelaId = await findStudentId(staff, "2025-0001"); // IT 2-A + IT102 retake with IT 1-E
    const enrollmentId = (await staff.get(`/api/students/${angelaId}`)).body.data.currentEnrollment.id;
    const preview = await staff.post(`/api/enrollments/${enrollmentId}/apply-fees`, { plan: "INSTALLMENT", preview: true });
    expect(preview.status).toBe(200);
    expect(preview.body.data.unitsDetail).toMatchObject({ base: 24, baseSource: "section", extra: 3, extraSubjects: 1, total: 27 });
    expect(preview.body.data.units).toBe(27);
    expect(preview.body.data.lines[0].description).toBe("Tuition Fee (27 units × ₱320)");

    // Staff can still type a different number.
    const custom = await staff.post(`/api/enrollments/${enrollmentId}/apply-fees`, { plan: "INSTALLMENT", units: 21, preview: true });
    expect(custom.body.data.units).toBe(21);
  });

  it("recalculates the tuition line when staff change only the units", async () => {
    const hannahId = await findStudentId(staff, "2026-0099"); // fees applied in the test above (23 units)
    const enrollmentId = (await staff.get(`/api/students/${hannahId}`)).body.data.currentEnrollment.id;
    const before = (await staff.get(`/api/enrollments/${enrollmentId}`)).body.data;
    const tuition = before.assessments.find((item: { tuitionUnits: unknown }) => item.tuitionUnits);
    expect(tuition.tuitionUnits).toEqual({ units: 23, ratePerUnit: 320 });

    const updated = await staff.put(`/api/enrollments/${enrollmentId}/assessments/${tuition.id}/units`, { units: 21 });
    expect(updated.status).toBe(200);
    const line = updated.body.data.assessments.find((item: { id: number }) => item.id === tuition.id);
    expect(line).toMatchObject({ description: "Tuition Fee (21 units × ₱320)", amount: "6720.00", tuitionUnits: { units: 21, ratePerUnit: 320 } });
    expect(updated.body.data.balance.totalAssessed).toBe("9220.00"); // 6,720 + 2,500

    // Other charges cannot be changed this way; units must be a whole number.
    const misc = before.assessments.find((item: { description: string }) => item.description === "Miscellaneous Fee");
    expect((await staff.put(`/api/enrollments/${enrollmentId}/assessments/${misc.id}/units`, { units: 3 })).status).toBe(400);
    expect((await staff.put(`/api/enrollments/${enrollmentId}/assessments/${tuition.id}/units`, { units: 2.5 })).status).toBe(422);
  });

  it("rejects plans that do not fit the program", async () => {
    const hannahId = await findStudentId(staff, "2026-0099");
    const enrollmentId = (await staff.get(`/api/students/${hannahId}`)).body.data.currentEnrollment.id;
    const wrong = await staff.post(`/api/enrollments/${enrollmentId}/apply-fees`, { plan: "SHS_VOUCHER", preview: true });
    expect(wrong.status).toBe(422);
  });

  it("charges nothing for Senior High students with a voucher", async () => {
    const programs = (await staff.get("/api/academic/programs")).body.data;
    const shs = programs.find((program: { code: string }) => program.code === "SHS");
    const term = (await staff.get("/api/academic/current-term")).body.data;
    const created = await staff.post("/api/students", {
      firstName: "Voucher",
      lastName: "Student",
      dateOfBirth: "2010-02-02",
      sex: "FEMALE",
      programId: shs.id,
      initialEnrollment: { semesterId: term.id, yearLevel: 11, sectionId: null, status: "PENDING" },
    });
    expect(created.status).toBe(201);
    const enrollmentId = created.body.data.student.currentEnrollment.id;

    const applied = await staff.post(`/api/enrollments/${enrollmentId}/apply-fees`, { plan: "SHS_VOUCHER" });
    expect(applied.body.data).toMatchObject({ total: "0.00", note: expect.stringMatching(/free/i) });
    expect((await staff.get(`/api/enrollments/${enrollmentId}`)).body.data.balance.balance).toBe("0.00");
  });

  it("adds the cross-enrollment fee when an irregular subject is added with it", async () => {
    const angelaId = await findStudentId(staff, "2025-0001");
    const enrollmentId = (await staff.get(`/api/students/${angelaId}`)).body.data.currentEnrollment.id;
    const before = Number((await staff.get(`/api/enrollments/${enrollmentId}`)).body.data.balance.totalAssessed);
    const available = (await staff.get(`/api/enrollments/${enrollmentId}/available-classes`)).body.data;
    const free = available.find((row: { conflictsWith: string[] }) => row.conflictsWith.length === 0);

    const added = await staff.post(`/api/enrollments/${enrollmentId}/subjects`, { sectionId: free.section.id, subjectId: free.subject.id, chargeCrossEnrollmentFee: true });
    expect(added.status).toBe(201);
    const after = Number((await staff.get(`/api/enrollments/${enrollmentId}`)).body.data.balance.totalAssessed);
    expect(after - before).toBe(2500);
  });

  it("lets only admins change the fee table", async () => {
    const list = (await staff.get("/api/fees")).body.data.schedules;
    const row = list.find((item: { programCode: string; yearLevel: number }) => item.programCode === "IT" && item.yearLevel === 1);
    const body = { ...row, units: 22 };
    expect((await staff.put(`/api/fees/${row.id}`, body)).status).toBe(403);
    const updated = await admin.put(`/api/fees/${row.id}`, body);
    expect(updated.status).toBe(200);
    expect(updated.body.data.total).toBe("9540.00"); // 22 x 320 + 2,500
  });
});
