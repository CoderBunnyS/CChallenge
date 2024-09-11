const express = require("express");
const router = express.Router();
const { FusionAuthClient } = require("@fusionauth/typescript-client");
const axios = require("axios"); // Include axios
const pkceChallenge = require("pkce-challenge");
const fs = require("fs");
const path = require("path");

// Set environment variables
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const fusionAuthURL = process.env.BASE_URL;
const client = new FusionAuthClient("DevKey8675309", fusionAuthURL);

//===========================================
//== Event Management Section (CRUD) ========
//===========================================

// Define the path to the events.json file
const filePath = path.join(__dirname, "../data/events.json");

// Function to read events from the JSON file
function readEventsFromFile() {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data || "[]"); // Return empty array if file is empty
  } catch (err) {
    console.error("Error reading events from file:", err);
    return [];
  }
}

// Function to write events to the JSON file
function writeEventsToFile(events) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(events, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing events to file:", err);
  }
}

// Home Page Route (Read events)
router.get("/", function (req, res, next) {
  const stateValue =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
  req.session.stateValue = stateValue;

  const pkce_pair = pkceChallenge.default();
  req.session.verifier = pkce_pair["code_verifier"];
  const challenge = pkce_pair["code_challenge"];

  const events = readEventsFromFile(); // Read events from the JSON file

  res.render("index", {
    user: req.session.user,
    title: "Event Planner",
    clientId: clientId,
    challenge: challenge,
    stateValue: stateValue,
    fusionAuthURL: fusionAuthURL,
    events: events, // Pass events to the home page
  });
});

// Create Event Page (GET)
router.get("/create-event", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/"); // Redirect if not logged in
  }

  res.render("create-event", {
    title: "Create New Event",
    user: req.session.user,
  });
});

// Create Event (POST)
router.post("/create-event", (req, res) => {
  const { name, date, location } = req.body;

  if (!name || !date || !location) {
    return res.status(400).send("All fields are required");
  }

  const events = readEventsFromFile(); // Read existing events from the file

  const newEvent = {
    id: events.length > 0 ? events[events.length - 1].id + 1 : 1, // Generate a new ID
    name,
    date,
    location,
  };

  events.push(newEvent); // Add the new event to the array

  writeEventsToFile(events); // Write the updated array back to the file

  console.log("Event created:", newEvent);
  res.redirect("/"); // Redirect back to the home page after saving
});

// Event Details Page (GET)
router.get("/events/:id", (req, res) => {
  const eventId = parseInt(req.params.id);
  const events = readEventsFromFile(); // Read events from the file
  const event = events.find((e) => e.id === eventId);

  if (!event) {
    return res.status(404).send("Event not found");
  }

  res.render("event-details", {
    title: `Event: ${event.name}`,
    event: event,
    user: req.session.user,
  });
});

// Edit Event Page (GET)
router.get("/events/:id/edit", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/"); // Redirect if not logged in
  }

  const eventId = parseInt(req.params.id);

  const events = readEventsFromFile(); // Read events from the file
  const event = events.find((e) => e.id === eventId);

  if (!event) {
    return res.status(404).send("Event not found");
  }

  res.render("edit-event", {
    title: `Edit Event: ${event.name}`,
    event: event,
    user: req.session.user,
  });
});

// Update Event (POST)
router.post("/events/:id/edit", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/"); // Redirect if not logged in
  }

  const eventId = parseInt(req.params.id);
  const { name, date, location } = req.body;

  const events = readEventsFromFile(); // Read events from the file
  const eventIndex = events.findIndex((e) => e.id === eventId);

  if (eventIndex === -1) {
    return res.status(404).send("Event not found");
  }

  // Update the event
  events[eventIndex].name = name;
  events[eventIndex].date = date;
  events[eventIndex].location = location;

  writeEventsToFile(events); // Write the updated events back to the file

  res.redirect(`/events/${eventId}`); // Redirect to the updated event details page
});

// Delete Event (POST)
router.post("/events/:id/delete", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/"); // Redirect if not logged in
  }

  const eventId = parseInt(req.params.id);

  let events = readEventsFromFile(); // Read events from the file

  const eventIndex = events.findIndex((e) => e.id === eventId);

  if (eventIndex === -1) {
    return res.status(404).send("Event not found");
  }

  events.splice(eventIndex, 1); // Remove the event from the array

  writeEventsToFile(events); // Write the updated events back to the file

  res.redirect("/"); // Redirect to the home page after deleting the event
});

//===========================================
//== Login and Authentication Section =======
//===========================================

// Logout Route
router.get("/logout", function (req, res, next) {
  req.session.destroy();
  res.redirect(302, "/");
});

// Login with Redirect Route
router.get("/login-with-redirect", (req, res) => {
  const redirectUri = req.query.redirect_uri;

  // Store the intended redirect URI in the session
  req.session.redirectUri = redirectUri;

  // Generate the PKCE challenge and state value
  const stateValue =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
  const pkcePair = pkceChallenge.default();
  const codeChallenge = pkcePair.code_challenge;
  const codeVerifier = pkcePair.code_verifier;

  // Store state and verifier in the session
  req.session.stateValue = stateValue;
  req.session.verifier = codeVerifier;

  // Redirect to FusionAuth's OAuth login page
  res.redirect(
    `${fusionAuthURL}/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=http://localhost:3000/oauth-redirect&scope=offline_access&state=${stateValue}&code_challenge=${codeChallenge}&code_challenge_method=S256`
  );
});

// OAuth Redirect Route
router.get("/oauth-redirect", function (req, res, next) {
  const stateFromServer = req.query.state;
  if (stateFromServer !== req.session.stateValue) {
    console.log("State doesn't match. uh-oh.");
    res.redirect(302, "/");
    return;
  }

  client
    .exchangeOAuthCodeForAccessTokenUsingPKCE(
      req.query.code,
      clientId,
      clientSecret,
      "http://localhost:3000/oauth-redirect",
      req.session.verifier
    )
    .then((response) => {
      return client.retrieveUserUsingJWT(response.response.access_token);
    })
    .then((response) => {
      req.session.user = response.response.user;
      req.session.customData = response.response.user.data; // Store custom data in session
      res.redirect(req.session.redirectUri || "/");
    })
    .catch((err) => {
      console.error("Error during OAuth:", JSON.stringify(err));
      res.redirect(302, "/");
    });
});

//===========================================
//== Profile and MFA Management Section =====
//===========================================

// Profile Page (GET)
router.get("/profile", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/"); // Redirect if not logged in
  }

  client
    .retrieveUser(req.session.user.id)
    .then((response) => {
      const user = response.response.user;

      // Check if any twoFactor methods exist
      const is2FAEnabled =
        user.twoFactor &&
        user.twoFactor.methods &&
        user.twoFactor.methods.length > 0;

      res.render("profile", {
        user: user,
        is2FAEnabled: is2FAEnabled, // Pass 2FA status to the profile template
      });
    })
    .catch((err) => {
      console.error("Error retrieving user:", err);
      res.redirect("/profile");
    });
});

// Enable MFA (POST)
router.post("/profile/mfa-enable", (req, res) => {
  if (!req.session.user) {
    console.log("No user in session, redirecting to login");
    return res.redirect("/"); // Redirect if not logged in
  }

  const userId = req.session.user.id;

  // Generate a secret for the user
  client
    .generateTwoFactorSecret()
    .then((response) => {
      const secret = response.response.secretBase32Encoded;

      console.log("2FA Secret generated:", secret);

      // Store the secret in the user's session for validation later
      req.session.twoFactorSecret = secret;

      // Render a QR code page for the user to scan with an Authenticator app
      res.render("mfa-setup", {
        title: "Set Up MFA",
        user: req.session.user,
        secret: secret, // Send the secret to the page
        qrCodeUrl: `otpauth://totp/${req.session.user.username}?secret=${secret}&issuer=YourAppName`, // Change the issuer name
      });
    })
    .catch((err) => {
      console.error("Error generating 2FA secret:", err);
      res.redirect("/profile?error=true");
    });
});

// Verify MFA (POST)
router.post("/profile/mfa-verify", (req, res) => {
  if (!req.session.user) {
    console.log("No user in session, redirecting to login");
    return res.redirect("/"); // Redirect if not logged in
  }

  const { totpCode, secret } = req.body;
  const userId = req.session.user.id;

  // Validate the TOTP code
  client
    .verifyTwoFactorCode(userId, {
      code: totpCode,
      secret: secret,
      method: "authenticator",
    })
    .then(() => {
      console.log("2FA successfully enabled for user:", userId);
      res.redirect("/profile?success=true"); // MFA enabled
    })
    .catch((err) => {
      console.error("Error verifying 2FA:", err);
      res.redirect("/profile?error=true");
    });
});

// Disable MFA (POST) using Axios
router.post("/profile/mfa-toggle", (req, res) => {
  if (!req.session.user) {
    console.log("No user in session, redirecting to login");
    return res.redirect("/"); // Redirect if not logged in
  }

  const { action, totpCode } = req.body; // Capture action (enable/disable) and TOTP code
  const userId = req.session.user.id;

  if (action === "disable") {
    if (!totpCode) {
      console.error("No TOTP code provided for disabling MFA.");
      return res.redirect("/profile?error=no_code");
    }

    const apiKey = process.env.FUSIONAUTH_API_KEY || 'DevKey8675309'; // Ensure the API key is set

    // Use Axios to send the DELETE request
    axios
      .delete(`http://localhost:9011/api/user/two-factor/${userId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        params: {
          code: totpCode,
          methodId: "authenticator", // Only allowing authenticator as MFA
        },
      })
      .then((response) => {
        console.log("2FA disabled successfully for user:", userId);
        req.session.user.twoFactor = null; // Remove twoFactor info from session
        res.redirect("/profile?success=true"); // 2FA disabled
      })
      .catch((error) => {
        console.error("Error disabling 2FA:", error.response?.status || error.message);
        res.redirect("/profile?error=true");
      });
  } else {
    console.error("Invalid MFA action received:", action); // Log invalid action
    res.redirect("/profile?error=true");
  }
});

// Profile Update (POST)
router.post("/profile/update", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/"); // Redirect if not logged in
  }

  const { nickname, favoriteEvent, hobby } = req.body;

  const userData = {
    nickname: nickname || null,
    favoriteEvent: favoriteEvent || null,
    hobby: hobby || null,
  };

  client
    .patchUser(req.session.user.id, {
      user: {
        data: userData,
      },
    })
    .then((response) => {
      req.session.user.data = response.response.user.data;
      res.redirect("/profile?success=true");
    })
    .catch((err) => {
      console.error("Error updating profile in FusionAuth:", err);
      res.redirect("/profile");
    });
});

module.exports = router;
