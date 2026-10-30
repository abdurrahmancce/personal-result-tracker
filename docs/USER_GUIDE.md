# 📖 User Guide — Personal Result Tracker

**Language:** English · [বাংলা](USER_GUIDE.bn.md)

This guide explains how to use the app, what each feature does, and exactly how every number is calculated.

> 🔒 Screenshots use **demo data**, not a real student's results.

---

## 📑 Contents

1. [Quick start](#1--quick-start)
2. [Signing in and syncing](#2--signing-in-and-syncing)
3. [The dashboard](#3--the-dashboard)
4. [Adding courses](#4--adding-courses)
5. [Ongoing courses](#5--ongoing-courses)
6. [Managing results](#6--managing-results)
7. [How the calculations work](#7--how-the-calculations-work)
8. [Analytics tools](#8--analytics-tools)
9. [Import from your university](#9--import-from-your-university)
10. [Download and share](#10--download-and-share)
11. [Profiles](#11--profiles)
12. [Use it as an app and offline](#12--use-it-as-an-app-and-offline)
13. [Troubleshooting and FAQ](#13--troubleshooting-and-faq)
14. [Glossary](#14--glossary)

---

## 1. 🚀 Quick start

1. Open the app and press **Sign in with Google**.
2. Go to **Import & Export**, paste your university **Result View** page, press **Read result**, then **Import**. *(Or add courses one by one, see [section 4](#4--adding-courses).)*
3. Open **Results** to see each semester, and the dashboard to see your **CGPA**.
4. For the running semester, tick **Ongoing course** and save what you know so far.
5. Open **Analytics** to forecast grades and plan your target.

---

## 2. 🔑 Signing in and syncing

![Login screen](screenshots/01-login.png)

- Press **Sign in with Google**. Use the **same Google account on every device** to see the same data.
- Your results are stored in **your own private area** of the database. Nobody else can read them (unless you create a [share link](#10--download-and-share)).
- The label at the top right shows the state: **Synced ✓** means saved to the cloud.
- **Logout** is next to your name.

---

## 3. 📊 The dashboard

![Dashboard](screenshots/02-dashboard.png)

| # | Item | Meaning |
|---|------|---------|
| 1 | **CGPA** | Your cumulative GPA, using the method chosen in 2. |
| 2 | **Method tabs** | *Attempted*, *Earned*, *Retake replaces*. See [7.3](#73-cgpa-three-methods). |
| 3 | **Tabs** | **Results**, **Analytics**, **Import & Export**. |
| 4 | **Add a course** | The form to add or edit a course. |

The cards next to the CGPA show:

| Card | Meaning |
|------|---------|
| **Degree progress** | Completed (passed) credits out of the credits required for your degree, with a progress bar and credits left. |
| **Credits required** | Your degree total. **Edit this number** to match your programme (default 161). It is saved per profile. |
| **Credits attempted** | Credits counted in CGPA, and the number of graded courses. |
| **Latest semester GPA** | GPA of your newest graded semester, with ▲/▼ showing the change from the semester before. |
| **Best semester** | The semester with the highest GPA. |
| **To retake** | Courses with **F** or **Y** that you have not retaken yet. |
| **Ongoing** | Number of ongoing courses and their credits. These are **not** in the CGPA. |

---

## 4. ➕ Adding courses

![Add course form](screenshots/04-add-course.png)

Open **Results** and fill in the **Add a course** form.

| Field | What to enter |
|-------|---------------|
| **Semester** | For example `Autumn-2026`. Pick from the list or type a new one. Courses with the same semester name are grouped together. |
| **Course code** | For example `CSE-1101`. `cse 1101`, `CSE1101` and `cse-1101` count as the **same** course (this matters for retakes). |
| **Course title** | The name of the course. |
| **Credit** | Credit hours, for example `3` or `1.5`. If left empty or invalid, `3` is used. |

Then choose how to enter the result:

### Option A: Enter marks
Fill **Mid /30**, **CT /10**, **Attendance /10** and **Final /50**. The app adds them to get the **Total /100** and shows the grade and points live below the form.

> Example: Mid 22 + CT 8 + Attendance 9 + Final 38 = **77** → grade **A** (3.75).

### Option B: I only know the grade
Choose **I only know the grade** and pick the grade from the list (`A+` … `D`, `F`, `Y`). Use this for old semesters where you do not remember the marks.

Press **Add course**. To change a course later, press **Edit** on its row, change it, then **Save**. Use **Cancel edit** to stop.

### Grade scale

| Total marks | Grade | Points |
|-------------|-------|--------|
| 80 – 100 | A+ | 4.00 |
| 75 – 79.99 | A | 3.75 |
| 70 – 74.99 | A- | 3.50 |
| 65 – 69.99 | B+ | 3.25 |
| 60 – 64.99 | B | 3.00 |
| 55 – 59.99 | B- | 2.75 |
| 50 – 54.99 | C+ | 2.50 |
| 45 – 49.99 | C | 2.25 |
| 40 – 44.99 | D | 2.00 |
| below 40 | F | 0.00 |
| – | **Y** (expelled / not allowed in the exam) | 0.00, not passed |

> ⚠️ This scale and the marks split (30 / 10 / 10 / 50) follow **IIUC** rules. If your university is different, ask the developer to adjust it (`calc.js`).

---

## 5. ⏳ Ongoing courses

![Ongoing courses forecast](screenshots/05-analytics.png)

A course in the **running semester** has no final result yet. Mark it as **ongoing** so you can keep notes and still use it for planning.

**What happens to an ongoing course**

| ✅ Used for | ❌ Not counted in |
|------------|------------------|
| Forecast, final marks needed, notes | GPA, CGPA, completed credits, charts, PDF/CSV result sheet, share links |

**How to add one**

- **While adding:** tick **⏳ Ongoing course — result not published yet**. Now Final is not required, and you can fill in whatever marks you have (Mid, CT, Attendance).
- **By import:** paste the **Course Status** page. Its *On Going* courses are saved as ongoing. See [section 9](#9--import-from-your-university).
- **A whole semester:** press **Mark ongoing** on the semester card. Every course of that semester becomes ongoing (grade removed, marks kept).

**When the result is published:** press **Enter result** on the course, fill in the final marks (or the grade), and **Save**. It becomes a normal graded course and is counted from that moment.

---

## 6. 🗂️ Managing results

![Semester results](screenshots/03-results.png)

- **Semester cards** show the semester GPA, credits and the CGPA up to that semester. Semesters are sorted by year and term (Spring → Summer → Autumn → Winter).
- **Row colours** show the grade level at a glance. A retaken old course shows a **retake** tag, and an old attempt shows **replaced** when *Retake replaces* is selected.
- **Edit / Delete** work on one course. **Rename** and **Delete** on the semester card work on the whole semester (Delete asks for confirmation).
- **Search** by course code, title or grade, and **Sort** the list.
- On a **phone**, the table becomes easy-to-read cards.

![Mobile card view](screenshots/08-mobile.png)

---

## 7. 🧮 How the calculations work

This is the exact logic used by the app. You can check every number yourself.

### 7.1 Course total and grade points

```
Total      = Mid + CT + Attendance + Final        (out of 100)
Grade      = the grade whose minimum is ≤ Total   (see the grade scale)
Points     = grade points of that grade           (for example A = 3.75)
Weighted   = Credit × Points                      (the "quality points")
```

### 7.2 Semester GPA

```
Semester GPA = Σ (Credit × Points)  ÷  Σ Credit
```

All **graded** courses of the semester are included (ongoing courses are not).

> Example semester

| Course | Credit | Grade | Points | Credit × Points |
|--------|-------:|-------|-------:|----------------:|
| Course A | 3 | A | 3.75 | 11.25 |
| Course B | 3 | B+ | 3.25 | 9.75 |
| Course C | 1.5 | A+ | 4.00 | 6.00 |
| Course D | 3 | F | 0.00 | 0.00 |
| **Total** | **10.5** | | | **27.00** |

`Semester GPA = 27.00 ÷ 10.5 = 2.571`

### 7.3 CGPA: three methods

All three use the same *points* (the sum of Credit × Points of all graded courses so far). They differ in the **credits you divide by**. Switch methods with the tabs on the dashboard. The chart, forecast and target tools follow the method you choose.

| Method | Formula | Notes |
|--------|---------|-------|
| **Attempted** *(official sheet method)* | `All points ÷ all attempted credits` | Every attempt counts, even a failed one. A retaken course keeps **both** attempts. |
| **Earned** | `All points ÷ credits of passed courses` | F and Y credits are left out of the division. Gives a higher number when you have failures. |
| **Retake replaces** | `Points of newest attempts ÷ credits of newest attempts` | Only the **latest attempt** of each course code counts. Shows your CGPA after improvement. Not an official number. |

> **Y (expelled) rule:** a **Y** course counts in that semester's GPA, but its credits are left out of the *cumulative* attempted credits. This matches the official IIUC sheet.

**Example (continuing 7.2).** In the next semester you retake Course D and get **B (3.00)**, and also take Course E (3 credits, **A-** = 3.50).

| | Value |
|--|------|
| Old points | 27.00 |
| New points | Course D: 3 × 3.00 = 9.00 · Course E: 3 × 3.50 = 10.50 |
| **Total points** | 27.00 + 9.00 + 10.50 = **46.50** |

| Method | Credits used | CGPA |
|--------|-------------|------|
| Attempted | 10.5 + 3 + 3 = **16.5** (old F still counts) | 46.50 ÷ 16.5 = **2.818** |
| Earned | passed credits: 7.5 + 3 + 3 = **13.5** | 46.50 ÷ 13.5 = **3.444** |
| Retake replaces | newest attempts: A 3 + B+ 3 + C 1.5 + D(retake) 3 + E 3 = **13.5** | 46.50 ÷ 13.5 = **3.444** |

### 7.4 Degree progress

```
Completed credits = credits of all PASSED graded courses
Credits left      = Required credits − Completed credits     (never below 0)
Progress %        = Completed ÷ Required × 100
```

### 7.5 Retakes

A course is a **retake** when the same course code (ignoring spaces, dashes and capital letters) appears again in a later semester. The older attempt is marked as retaken.

- **To retake** card: graded courses with **F or Y** that have not been retaken, and are not currently ongoing.
- **Retake & improvement** (Analytics): for each such course (and weak **D** courses), choose the grade you hope to get and see the CGPA **before → after**.

### 7.6 Ongoing courses forecast

```
Expected grade  = the grade you pick for each ongoing course (default B+)
Projected CGPA  = CGPA calculated as if every ongoing course ended with its expected grade
Semester GPA    = Σ (Credit × expected points) ÷ Σ Credit   (ongoing courses only)
```

**Final needed** for a course that has marks so far:

```
Marks so far = Mid + CT + Attendance                   (out of 50)
Final needed = (minimum total of the expected grade) − Marks so far
```

> Example: Mid 21 + CT 7 + Attendance 9 = **37**. For **B+** (minimum 65): 65 − 37 = **Final ≥ 28 / 50**.

If the number is over 50, the grade is **not possible**. If it is 0 or less, the grade is already **secured**.

### 7.7 Target CGPA

Assumes your next courses are **new** and you **pass** them.

```
Needed GPA = ( Target × (Credits now + Next credits) − Points now ) ÷ Next credits
Best case  = ( Points now + 4.00 × Next credits ) ÷ (Credits now + Next credits)
```

> Example: Points now **100**, credits now **30** (CGPA 3.333). Next semester **20** credits, target **3.50**.
> Needed GPA = (3.50 × 50 − 100) ÷ 20 = **3.75** (about an A average).
> Best case = (100 + 80) ÷ 50 = 3.60, so the target is reachable.

- If the needed GPA is above **4.00**, the app says the target is **not possible** in one semester and shows how many semesters at straight 4.00 are needed.
- It also shows the **average GPA needed over your remaining credits**.
- The table shows what your CGPA becomes for next-semester GPA of 2.50, 3.00, 3.25, 3.50, 3.75 and 4.00. In *Earned* mode, a semester GPA of 0 adds no passed credits.

### 7.8 Final marks predictor

```
Marks so far = Mid + CT + Attendance
Final needed = Grade minimum total − Marks so far     (0 if already secured, "Not possible" if above 50)
```

The table lists every grade from **A+ to D** with the total needed and the final marks needed.

---

## 8. 📈 Analytics tools

Open the **Analytics** tab.

![Analytics](screenshots/05-analytics.png)

| Tool | How to use it |
|------|---------------|
| **CGPA progress** | Line chart of **semester GPA** and **CGPA** per semester (graded semesters only). **Show table** switches to a table. |
| **Ongoing courses forecast** | Pick **Expect … in all courses** or choose a grade per course. The result line shows the semester GPA and CGPA **before → after**. **Predict** sends that course's marks to the Final marks predictor. |
| **Target CGPA** | Enter a target CGPA and next-semester credits. Read the GPA you need, or the message that it is not possible. |
| **Final marks predictor** | Enter Mid, CT and Attendance. The table shows the final marks needed for each grade. |
| **Retake & improvement** | Choose the grade you expect (**If I get**) and see the new CGPA. **Add retake** adds the course to the form for you. |

---

## 9. 📥 Import from your university

![Import and export](screenshots/06-import-export.png)

1. Open your university portal.
2. Open the **Result View** page (finished semesters) or the **Course Status** page (running semester).
3. Select all (**Ctrl + A**), copy (**Ctrl + C**).
4. In the app, open **Import & Export**, paste into the box, and press **Read result**.
5. Check the **preview**: the number of semesters and courses, and any rows that could not be read.
6. Choose how to import:
   - **Add to this profile (skip courses already there)**: safe, no duplicates.
   - **Replace … in this profile with this**: first deletes the courses it replaces (you are asked to confirm).
7. Press **Import**.

What gets imported:

| Page | Result |
|------|--------|
| **Result View** | Every semester with its courses, credits and grades. Your degree's *required credits* is also read. |
| **Course Status** | The *On Going* courses of the running semester, saved as **ongoing**. |

> 🔒 Everything is processed in your browser and saved only to your own account.

---

## 10. 📄 Download and share

### Download
- **Download PDF**: a clean result sheet.
- **Download Excel / CSV**: opens in Excel or Google Sheets. It also lists ongoing courses under *Ongoing (not counted)*.

Ongoing courses and semesters with only ongoing courses are **not** in the PDF.

### Share (read-only)
1. *(Optional)* Tick **Hide marks (show only grades)**.
2. Press **Create link** and copy the link.
3. Send it to a friend or family member. They can **view** but **not edit**.

- The link shows a **snapshot**. After you change results, press **Update link** to refresh it.
- Ongoing courses are **never** shared.
- Press **Stop sharing** to turn the link off.

---

## 11. 👤 Profiles

Use profiles to keep separate results in one account, for example yourself and a sibling.

- **Profile** drop-down: switch profile.
- **+ New**: create a profile. **Rename**: change its name. **Delete**: remove it and all its courses (asks for confirmation).
- Each profile has its own courses, required credits, share link and CGPA.

---

## 12. 📲 Use it as an app and offline

| Device | Steps |
|--------|-------|
| 🤖 **Android (Chrome)** | Sign in, then tap **Install app** (or menu ⋮ → *Install app*). |
| 🍎 **iPhone / iPad** | Open in **Safari** → **Share** → **Add to Home Screen**. |
| 💻 **Windows / Mac** | Click the **install icon** in the address bar (Chrome or Edge), or the **Install app** button. |

- If the install button is missing, the app may already be installed. Look for **Open in app** in the address bar.
- **Offline:** you can open the app, view results and add or edit courses without internet. Changes are saved on the device and sync when you are online again.
- On iPhone, the installed app keeps separate storage, so you may need to **sign in again** once.
- **Dark / light mode:** press the ☀️ / 🌙 button at the top right.

---

## 13. 🛠️ Troubleshooting and FAQ

**My CGPA does not match the university sheet.**
Check the **Attempted** method (the official one). Make sure all courses are entered, credits are correct, and no test course or duplicate is left. A **Y** course has special handling ([7.3](#73-cgpa-three-methods)). Ongoing courses are not counted.

**An F course is still counted after I started retaking it.**
Mark the new attempt as **ongoing**, or enter its result. Courses that are currently ongoing are removed from *To retake*.

**Why is my Earned CGPA higher than Attempted?**
Earned divides by passed credits only, so failed credits do not pull the average down.

**The marks I typed show 0 or a wrong grade.**
Check the limits: Mid ≤ 30, CT ≤ 10, Attendance ≤ 10, Final ≤ 50. Use **I only know the grade** if you do not have marks.

**My semester is in the wrong order.**
Use names like `Spring-2026`, `Autumn-2026` (term + year). Other names are placed after them.

**Import says some rows could not be read.**
Copy the whole page again with **Ctrl + A**, or add those courses by hand.

**Login does not work in the installed app.**
Log in once in the browser, then reopen the app. Make sure pop-ups are allowed.

**Is my data private?**
Yes. It is stored in your own account area. Only a **share link** you create can show it to others, and you can stop it any time.

**Can I use it for another university?**
The grade scale and marks split follow IIUC. You can still add grades directly with **I only know the grade**, but the marks calculation would need a small change in `calc.js`.

---

## 14. 📚 Glossary

| Term | Meaning |
|------|---------|
| **GPA** | Grade point average of one semester. |
| **CGPA** | Cumulative GPA over all semesters. |
| **Credit** | Weight of a course (credit hours). |
| **Points** | Grade points for a grade, for example A = 3.75. |
| **Quality points** | Credit × Points. |
| **Attempted credits** | All credits you tried, including failed ones. |
| **Earned / completed credits** | Credits of courses you passed. |
| **Retake** | Taking a course again after F, Y or a low grade. |
| **Ongoing** | A course in the running semester without a final result. |
| **Mid / CT / Att. / Final** | Mid-term (30), Class Test (10), Attendance (10), Final exam (50). |
| **Y** | Not allowed in the exam (expelled). Counts as 0 and is not passed. |

---

💬 Found a problem or have an idea? Open an [issue](https://github.com/abdurrahmancce/personal-result-tracker/issues).
