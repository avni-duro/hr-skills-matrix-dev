import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

// Helper to send email via your email service
async function sendEmailReport(recipients: string[], subject: string, htmlContent: string) {
  try {
    // You'll need to configure your email service (Resend, SendGrid, etc.)
    // Example using Resend (replace with your email service)
    const emailService = Deno.env.get("EMAIL_SERVICE") || "resend";

    if (emailService === "resend") {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "noreply@duroacademy.com",
          to: recipients,
          subject,
          html: htmlContent,
        }),
      });

      return response.ok;
    }
    return false;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

// Helper to generate video progress report HTML
async function generateVideoProgressReport(userId: string, branchId?: string) {
  try {
    let query = supabaseClient
      .from("video_progress")
      .select(
        `
        id,
        user_id,
        module_id,
        video_id,
        progress_percentage,
        completed,
        watched_duration,
        total_duration,
        last_watched_at,
        completed_at,
        created_at,
        videos:video_id(id, title, duration, module_id),
        users:user_id(id, full_name, email, branch_id)
      `
      )
      .eq("user_id", userId);

    if (branchId) {
      query = query.eq("users.branch_id", branchId);
    }

    const { data: videoProgress, error } = await query;

    if (error) throw error;

    // Calculate statistics
    const totalVideos = videoProgress?.length || 0;
    const completedVideos = videoProgress?.filter((v) => v.completed).length || 0;
    const averageProgress =
      totalVideos > 0
        ? Math.round(
            videoProgress!.reduce((sum, v) => sum + v.progress_percentage, 0) / totalVideos
          )
        : 0;

    // Get user info
    const user = videoProgress?.[0]?.users;

    // Generate HTML report
    const reportDate = new Date().toLocaleDateString("en-IN");
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
              background: #f9f9f9;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              border-radius: 8px;
              margin-bottom: 30px;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
            }
            .header p {
              margin: 5px 0 0 0;
              opacity: 0.9;
            }
            .stats {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 20px;
              margin-bottom: 30px;
            }
            .stat-box {
              background: white;
              padding: 20px;
              border-radius: 8px;
              text-align: center;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .stat-box .number {
              font-size: 32px;
              font-weight: bold;
              color: #667eea;
              margin: 10px 0;
            }
            .stat-box .label {
              color: #666;
              font-size: 14px;
            }
            .video-list {
              background: white;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .video-item {
              padding: 15px 20px;
              border-bottom: 1px solid #eee;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .video-item:last-child {
              border-bottom: none;
            }
            .video-title {
              font-weight: 500;
              color: #333;
            }
            .progress-bar {
              width: 100px;
              height: 6px;
              background: #eee;
              border-radius: 3px;
              overflow: hidden;
              margin-top: 5px;
            }
            .progress-fill {
              height: 100%;
              background: #667eea;
              border-radius: 3px;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              color: #999;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📊 Video Progress Report</h1>
              <p>User: ${user?.full_name || "N/A"}</p>
              <p>Report Date: ${reportDate}</p>
            </div>

            <div class="stats">
              <div class="stat-box">
                <div class="label">Total Videos</div>
                <div class="number">${totalVideos}</div>
              </div>
              <div class="stat-box">
                <div class="label">Completed</div>
                <div class="number">${completedVideos}</div>
              </div>
              <div class="stat-box">
                <div class="label">Avg Progress</div>
                <div class="number">${averageProgress}%</div>
              </div>
            </div>

            <h3 style="margin-top: 30px; margin-bottom: 15px; color: #333;">Video Details</h3>
            <div class="video-list">
              ${videoProgress
                ?.map(
                  (video) => `
                <div class="video-item">
                  <div>
                    <div class="video-title">${video.videos?.title || "N/A"}</div>
                    <div class="progress-bar">
                      <div class="progress-fill" style="width: ${video.progress_percentage}%"></div>
                    </div>
                  </div>
                  <div style="text-align: right;">
                    <div style="font-weight: bold; color: ${video.completed ? "#28a745" : "#666"}">
                      ${video.progress_percentage}%
                    </div>
                    <div style="font-size: 12px; color: #999;">
                      ${video.completed ? "✓ Completed" : "In Progress"}
                    </div>
                  </div>
                </div>
              `
                )
                .join("")}
            </div>

            <div class="footer">
              <p>This is an automated report from DURO Academy Admin Panel</p>
              <p>Generated on ${new Date().toLocaleString("en-IN")}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return htmlContent;
  } catch (error) {
    console.error("Error generating report:", error);
    throw error;
  }
}

// Check if a schedule should be sent now
function shouldSendNow(
  schedule: any,
  currentTime: Date
): boolean {
  const lastSent = schedule.last_sent_at ? new Date(schedule.last_sent_at) : null;
  const scheduledTime = schedule.send_time; // HH:MM format

  // Parse schedule send time
  const [scheduleHour, scheduleMinute] = scheduledTime.split(":").map(Number);
  const scheduleDateTime = new Date(currentTime);
  scheduleDateTime.setHours(scheduleHour, scheduleMinute, 0, 0);

  // Within 5-minute window of scheduled time
  const timeWindow = 5 * 60 * 1000; // 5 minutes
  const isTimeWindow = Math.abs(currentTime.getTime() - scheduleDateTime.getTime()) < timeWindow;

  if (!isTimeWindow) return false;

  // Check frequency
  const dayOfWeek = currentTime.toLocaleDateString("en-US", { weekday: "lowercase" });
  const dayOfMonth = currentTime.getDate();

  switch (schedule.frequency) {
    case "daily":
      // Should send if not sent today
      if (!lastSent) return true;
      const lastSentDate = new Date(lastSent);
      return lastSentDate.toDateString() !== currentTime.toDateString();

    case "weekly":
      // Check if today matches scheduled day
      const scheduledDays = schedule.schedule_days
        .split(",")
        .map((d: string) => d.trim().toLowerCase());
      if (!scheduledDays.includes(dayOfWeek)) return false;
      // Should send if not sent this week
      if (!lastSent) return true;
      const lastSentWeek = Math.floor(lastSent.getTime() / (7 * 24 * 60 * 60 * 1000));
      const currentWeek = Math.floor(currentTime.getTime() / (7 * 24 * 60 * 60 * 1000));
      return lastSentWeek !== currentWeek;

    case "monthly":
      // Check if today matches scheduled day
      const scheduledDay = parseInt(schedule.schedule_days);
      if (dayOfMonth !== scheduledDay) return false;
      // Should send if not sent this month
      if (!lastSent) return true;
      const lastSentMonth = lastSent.getFullYear() * 100 + lastSent.getMonth();
      const currentMonth = currentTime.getFullYear() * 100 + currentTime.getMonth();
      return lastSentMonth !== currentMonth;

    default:
      return false;
  }
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch all active schedules
    const { data: schedules, error: scheduleError } = await supabaseClient
      .from("video_progress_report_schedules")
      .select("*")
      .eq("is_active", true);

    if (scheduleError) throw scheduleError;

    const currentTime = new Date();
    const sentReports = [];
    const failedReports = [];

    // Process each schedule
    for (const schedule of schedules || []) {
      try {
        if (!shouldSendNow(schedule, currentTime)) {
          continue;
        }

        // Generate report
        const htmlContent = await generateVideoProgressReport(
          schedule.target_user_id,
          schedule.branch_id
        );

        // Send email
        const recipients = schedule.recipient_emails
          .split(",")
          .map((e: string) => e.trim());
        const emailSent = await sendEmailReport(
          recipients,
          `Video Progress Report - ${new Date().toLocaleDateString("en-IN")}`,
          htmlContent
        );

        if (emailSent) {
          // Update last_sent_at and next_send_at
          const nextSendAt = new Date(currentTime);

          if (schedule.frequency === "daily") {
            nextSendAt.setDate(nextSendAt.getDate() + 1);
          } else if (schedule.frequency === "weekly") {
            nextSendAt.setDate(nextSendAt.getDate() + 7);
          } else if (schedule.frequency === "monthly") {
            nextSendAt.setMonth(nextSendAt.getMonth() + 1);
          }

          await supabaseClient
            .from("video_progress_report_schedules")
            .update({
              last_sent_at: currentTime.toISOString(),
              next_send_at: nextSendAt.toISOString(),
            })
            .eq("id", schedule.id);

          sentReports.push({
            scheduleId: schedule.id,
            targetUser: schedule.target_user_id,
            recipients,
          });
        } else {
          failedReports.push({
            scheduleId: schedule.id,
            reason: "Email send failed",
          });
        }
      } catch (error) {
        console.error(`Error processing schedule ${schedule.id}:`, error);
        failedReports.push({
          scheduleId: schedule.id,
          reason: error.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sentReports: sentReports.length,
        failedReports: failedReports.length,
        details: {
          sent: sentReports,
          failed: failedReports,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Function error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
