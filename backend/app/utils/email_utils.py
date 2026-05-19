"""
Email notification service for AttendSnap.
Uses Resend API for reliable email delivery with premium HTML templates
and matplotlib-generated attendance statistics charts.

Setup:
  In .env, add:
    RESEND_API_KEY=re_xxxxx
"""

import os
import io
import base64
from datetime import datetime, timezone

import resend
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend — safe for server use
import matplotlib.pyplot as plt

from app.logger import logger
from app.utils.cloudinary_helper import upload_image_to_cloudinary


# ── Resend Configuration ──────────────────────────────────────────────────────
resend.api_key = os.getenv("RESEND_API_KEY", "")

# The "from" address — use onboarding@resend.dev for testing,
# or your verified domain (e.g. noreply@yourdomain.com)
FROM_EMAIL = os.getenv("EMAIL_FROM", "AttendSnap <onboarding@resend.dev>")


# ═══════════════════════════════════════════════════════════════════════════════
#  MATPLOTLIB CHART GENERATION (LIGHT THEME)
# ═══════════════════════════════════════════════════════════════════════════════

def _generate_attendance_donut_chart(present: int, absent: int, student_name: str) -> str:
    """Generate a premium light-themed donut chart and upload to Cloudinary."""
    total = present + absent
    if total == 0:
        return ""

    present_pct = (present / total) * 100
    absent_pct = (absent / total) * 100

    fig, ax = plt.subplots(figsize=(4.5, 3.5), dpi=200)
    fig.patch.set_facecolor("#ffffff")

    colors = ["#10b981", "#ef4444"]
    sizes = [present_pct, absent_pct]
    labels = [f"Present\n{present_pct:.1f}%", f"Absent\n{absent_pct:.1f}%"]
    explode = (0.03, 0.03)

    ax.pie(
        sizes,
        labels=labels,
        colors=colors,
        explode=explode,
        autopct="",
        startangle=90,
        pctdistance=0.75,
        wedgeprops=dict(width=0.45, edgecolor="#ffffff", linewidth=2),
        textprops=dict(color="#1e293b", fontsize=9, fontweight="bold"),
    )

    ax.text(
        0, 0,
        f"{present_pct:.0f}%",
        ha="center", va="center",
        fontsize=24, fontweight="bold",
        color="#10b981",
    )
    ax.text(
        0, -0.22,
        "ATTENDANCE",
        ha="center", va="center",
        fontsize=7, fontweight="bold",
        color="#64748b",
    )

    ax.set_title("Attendance Stats", fontsize=12, fontweight="bold", color="#0f172a", pad=12)

    fig.text(
        0.5, 0.02,
        f"Present: {present}   Absent: {absent}   Total: {total}",
        ha="center", fontsize=9, color="#64748b", fontweight="500"
    )

    plt.tight_layout(pad=1.5)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode("utf-8")
    buf.close()

    # Upload to Cloudinary for reliable email rendering
    data_uri = f"data:image/png;base64,{b64}"
    try:
        url = upload_image_to_cloudinary(data_uri, folder_name="attendsnap_email_charts")
        return url
    except Exception as e:
        logger.error(f"Failed to upload donut chart to Cloudinary: {e}")
        return ""


def _generate_history_bar_chart(attendance_records: list[dict], student_name: str) -> str:
    """Generate a light-themed bar chart showing last 10 sessions and upload to Cloudinary."""
    if not attendance_records:
        return ""

    recent = attendance_records[-10:]
    dates = []
    statuses = []
    for rec in recent:
        date_str = rec.get("date", "")
        dates.append(date_str[:10] if len(date_str) >= 10 else (date_str[:8] if date_str else "?"))
        statuses.append(1 if rec.get("status") == "present" else 0)

    fig, ax = plt.subplots(figsize=(5, 2.5), dpi=200)
    fig.patch.set_facecolor("#ffffff")
    ax.set_facecolor("#ffffff")

    bar_colors = ["#10b981" if s == 1 else "#ef4444" for s in statuses]
    bars = ax.bar(range(len(dates)), [1] * len(dates), color=bar_colors, width=0.6, edgecolor="#ffffff", linewidth=1, align="center")

    for i, (bar, status) in enumerate(zip(bars, statuses)):
        ax.text(
            bar.get_x() + bar.get_width() / 2, 0.5,
            "P" if status else "A",
            ha="center", va="center",
            fontsize=10, fontweight="bold",
            color="#ffffff",
        )

    ax.set_xticks(range(len(dates)))
    ax.set_xticklabels(dates, rotation=45, ha="right", fontsize=7, color="#475569")
    ax.set_yticks([])
    ax.set_ylim(0, 1.2)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_visible(False)
    ax.spines["bottom"].set_color("#cbd5e1")
    ax.tick_params(axis="x", colors="#475569")

    present_count = sum(statuses)
    total_count = len(statuses)
    ax.set_title(
        f"Last {total_count} Sessions — {present_count}/{total_count} Present",
        fontsize=10, fontweight="bold", color="#0f172a", pad=12,
    )

    plt.tight_layout(pad=1.0)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode("utf-8")
    buf.close()

    data_uri = f"data:image/png;base64,{b64}"
    try:
        url = upload_image_to_cloudinary(data_uri, folder_name="attendsnap_email_charts")
        return url
    except Exception as e:
        logger.error(f"Failed to upload history chart to Cloudinary: {e}")
        return ""


# ═══════════════════════════════════════════════════════════════════════════════
#  PREMIUM LIGHT THEME HTML EMAIL
# ═══════════════════════════════════════════════════════════════════════════════

def _build_attendance_html(
    student_name: str,
    status: str,
    session_date: str,
    time_from: str = "",
    time_to: str = "",
    subject_name: str = "",
    method: str = "ai",
    donut_chart_url: str = "",
    history_chart_url: str = "",
    note: str = "",
) -> str:
    """Build a highly professional, Apple-style HTML email body."""

    year = datetime.now().year
    
    # Theme Tokens
    if status == "present":
        primary = "#10b981"
        bg_light = "#f0fdf4"
        border_light = "#bbf7d0"
        icon = "✓"
        status_label = "Marked Present"
    else:
        primary = "#ef4444"
        bg_light = "#fef2f2"
        border_light = "#fecaca"
        icon = "✗"
        status_label = "Marked Absent"

    method_label = "Automated AI Recognition" if method == "ai" else "Manual Administrator Entry"
    time_display = f"{time_from} — {time_to}" if (time_from and time_to) else time_from

    charts_html = ""
    if donut_chart_url:
        charts_html += f"""
        <div style="text-align:center; margin: 32px 0 16px;">
          <img src="{donut_chart_url}" alt="Attendance Statistics"
               style="max-width:100%; width:450px; border-radius:16px; border:1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);" />
        </div>
        """
    if history_chart_url:
        charts_html += f"""
        <div style="text-align:center; margin: 0 0 32px;">
          <img src="{history_chart_url}" alt="Attendance History"
               style="max-width:100%; width:480px; border-radius:16px; border:1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);" />
        </div>
        """

    html = f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Attendance Update</title>
</head>
<body style="margin:0; padding:24px; background:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#334155; -webkit-font-smoothing:antialiased;">

  <!-- Main Container -->
  <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:24px; border:1px solid #e2e8f0; box-shadow:0 10px 15px -3px rgba(0,0,0,0.05); overflow:hidden;">

    <!-- Header -->
    <div style="padding:40px 32px 32px; text-align:center; background:#ffffff; border-bottom:1px solid #f1f5f9;">
      <div style="width:48px; height:48px; background:#f1f5f9; border-radius:12px; display:inline-flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:16px;">
        🎯
      </div>
      <h1 style="margin:0; font-size:24px; font-weight:800; color:#0f172a; letter-spacing:-0.5px;">
        AttendSnap
      </h1>
      <p style="margin:6px 0 0; font-size:14px; color:#64748b; font-weight:500;">
        Student Attendance Report
      </p>
    </div>

    <!-- Content -->
    <div style="padding:40px 32px;">
      
      <p style="font-size:16px; color:#334155; line-height:1.6; margin:0 0 24px;">
        Hello <strong style="color:#0f172a;">{student_name}</strong>,<br>
        Your attendance has been officially recorded for the following session.
      </p>

      <!-- Big Status Alert -->
      <div style="background:{bg_light}; border:1px solid {border_light}; border-radius:16px; padding:20px; display:flex; align-items:center; margin-bottom:32px;">
        <div style="width:40px; height:40px; background:{primary}; border-radius:50%; display:inline-block; text-align:center; line-height:40px; color:#fff; font-size:20px; font-weight:bold; margin-right:16px;">
          {icon}
        </div>
        <div>
          <div style="font-size:13px; color:#64748b; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px;">Status</div>
          <div style="font-size:18px; color:{primary}; font-weight:700;">{status_label}</div>
        </div>
      </div>

      <!-- Details Table -->
      <div style="background:#f8fafc; border-radius:16px; padding:24px; border:1px solid #f1f5f9; margin-bottom:16px;">
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <tr>
            <td style="padding:10px 0; color:#64748b; width:100px; border-bottom:1px solid #e2e8f0;">Date</td>
            <td style="padding:10px 0; color:#0f172a; font-weight:600; border-bottom:1px solid #e2e8f0;">{session_date}</td>
          </tr>
          {"<tr><td style='padding:10px 0; color:#64748b; border-bottom:1px solid #e2e8f0;'>Time</td><td style='padding:10px 0; color:#0f172a; font-weight:600; border-bottom:1px solid #e2e8f0;'>" + time_display + "</td></tr>" if time_display else ""}
          {"<tr><td style='padding:10px 0; color:#64748b; border-bottom:1px solid #e2e8f0;'>Subject</td><td style='padding:10px 0; color:#0f172a; font-weight:600; border-bottom:1px solid #e2e8f0;'>" + subject_name + "</td></tr>" if subject_name else ""}
          <tr>
            <td style="padding:10px 0 0; color:#64748b;">Method</td>
            <td style="padding:10px 0 0; color:#0f172a; font-weight:500;">{method_label}</td>
          </tr>
        </table>
      </div>

      {f'''
      <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:12px; padding:16px; margin:24px 0;">
        <span style="font-weight:600; color:#d97706;">Note from Admin:</span> 
        <span style="color:#b45309;">{note}</span>
      </div>
      ''' if note else ''}

      <!-- Cloudinary Hosted Charts -->
      {charts_html}

      <div style="text-align:center; padding-top:24px; border-top:1px solid #f1f5f9;">
        <p style="font-size:13px; color:#94a3b8; line-height:1.6; margin:0;">
          This is an automated message. If you believe this attendance record is incorrect, please contact your administrator.
        </p>
      </div>

    </div>

    <!-- Footer -->
    <div style="background:#f8fafc; padding:24px 32px; text-align:center; border-top:1px solid #e2e8f0;">
      <p style="margin:0 0 6px; font-size:12px; color:#64748b; font-weight:600;">
        © {year} AttendSnap University System
      </p>
      <p style="margin:0; font-size:11px; color:#94a3b8;">
        Secured by FaceNet • Automated Attendance
      </p>
    </div>
  </div>

</body>
</html>
"""
    return html


# ═══════════════════════════════════════════════════════════════════════════════
#  RESEND EMAIL SENDER
# ═══════════════════════════════════════════════════════════════════════════════

def send_attendance_email(
    to_email: str,
    student_name: str,
    status: str = "present",
    session_date: str = "",
    time_from: str = "",
    time_to: str = "",
    subject_name: str = "",
    method: str = "ai",
    attendance_history: list[dict] = None,
    note: str = "",
) -> bool:
    """
    Send an attendance confirmation email using Resend API.
    Charts are generated, hosted on Cloudinary, and embedded in the HTML.
    """
    api_key = os.getenv("RESEND_API_KEY", "")
    if not api_key:
        logger.warning("RESEND_API_KEY not set in .env — skipping email")
        return False

    resend.api_key = api_key

    if not to_email:
        return False

    try:
        student_present = 0
        student_absent = 0
        if attendance_history:
            student_present = sum(1 for r in attendance_history if r.get("status") == "present")
            student_absent = sum(1 for r in attendance_history if r.get("status") == "absent")

        # ── Generate and Upload Charts to Cloudinary ──
        donut_url = _generate_attendance_donut_chart(
            present=student_present,
            absent=student_absent,
            student_name=student_name,
        )

        history_url = ""
        if attendance_history:
            history_url = _generate_history_bar_chart(
                attendance_records=attendance_history,
                student_name=student_name,
            )

        # ── Build Premium HTML ──
        html_body = _build_attendance_html(
            student_name=student_name,
            status=status,
            session_date=session_date,
            time_from=time_from,
            time_to=time_to,
            subject_name=subject_name,
            method=method,
            donut_chart_url=donut_url,
            history_chart_url=history_url,
            note=note,
        )

        # ── Clean Subject Line ──
        subject_line = f"Attendance Update: {'Present' if status == 'present' else 'Absent'} on {session_date}"
        if subject_name:
            subject_line = f"[{subject_name}] " + subject_line

        # ── Send via Resend (No inline attachments, strictly URL based) ──
        params = {
            "from": FROM_EMAIL,
            "to": [to_email],
            "subject": subject_line,
            "html": html_body,
        }

        result = resend.Emails.send(params)
        logger.info(f"Attendance email sent to {to_email} (Resend ID: {result.get('id', 'N/A')})")
        return True

    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


def send_attendance_emails_bulk(
    students: list[dict],
    session_date: str = "",
    time_from: str = "",
    time_to: str = "",
    subject_name: str = "",
    method: str = "ai",
    note: str = "",
    all_attendance_records: dict = None,
) -> dict:
    """Send attendance emails to all processed students."""
    sent = 0
    failed = 0

    if all_attendance_records is None:
        all_attendance_records = {}

    for s in students:
        email = s.get("email")
        name = s.get("name", "Student")
        prn = s.get("prn", "")
        student_status = s.get("status", "present")

        if not email:
            failed += 1
            continue

        # Get this student's historical attendance for the chart
        history = all_attendance_records.get(prn, [])

        ok = send_attendance_email(
            to_email=email,
            student_name=name,
            status=student_status,
            session_date=session_date,
            time_from=time_from,
            time_to=time_to,
            subject_name=subject_name,
            method=method,
            attendance_history=history,
            note=note,
        )

        if ok:
            sent += 1
        else:
            failed += 1

    logger.info(f"Email notifications: {sent} sent, {failed} failed")
    return {"sent": sent, "failed": failed}
