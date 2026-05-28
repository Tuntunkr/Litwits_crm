export const handler = async (event) => {

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    const body = JSON.parse(event.body);

    const response = await fetch("https://rvxiowsewfsplykwxrrj.supabase.co/rest/v1/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2eGlvd3Nld2ZzcGx5a3d4cnJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjk1MTAsImV4cCI6MjA5Mjk0NTUxMH0.ONkPhiHm8zHvZrHcpsjyrZHeM316l36kv9z9hK8zrrQ",
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2eGlvd3Nld2ZzcGx5a3d4cnJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjk1MTAsImV4cCI6MjA5Mjk0NTUxMH0.ONkPhiHm8zHvZrHcpsjyrZHeM316l36kv9z9hK8zrrQ",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        phone: body.phone,
        message: body.message,
        source: "WhatsApp",
        status: "New Query"
      })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed" })
    };
  }
};
