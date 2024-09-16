const express = require("express");
const router = express.Router();
const { FusionAuthClient } = require("@fusionauth/typescript-client");
const axios = require("axios");
const pkceChallenge = require("pkce-challenge");
const fs = require("fs");
const path = require("path");

// Set environment variables
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const fusionAuthURL = process.env.BASE_URL;
const apiKey = process.env.FUSIONAUTH_API_KEY || 'DevKey8675309';
const client = new FusionAuthClient(apiKey, fusionAuthURL);

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
router.get("/", function (req, res) {
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
    clientId,
    challenge,
    stateValue,
    fusionAuthURL,
    events, // Pass events to the home page
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

  // Ensure the user is logged in and has a role
  if (req.session.user && req.session.user.registrations && req.session.user.registrations[0].roles) {
    const userRoles = req.session.user.registrations[0].roles;

    // Determine which buttons/actions to display based on the user's role
    let canEdit = false;
    let canDelete = false;

    if (userRoles.includes('admin')) {
      // Admin can edit and delete
      canEdit = true;
      canDelete = true;
    } else if (userRoles.includes('editor')) {
      // Editor can only edit
      canEdit = true;
    } else if (userRoles.includes('Viewer')) {
      // Viewer can only view
      canEdit = false;
      canDelete = false;
    }

    res.render("event-details", {
      title: `Event: ${event.name}`,
      event: event,
      user: req.session.user,
      canEdit: canEdit,  // Pass the edit permission to the view
      canDelete: canDelete  // Pass the delete permission to the view
    });
  } else {
    // If not logged in, redirect to login or show error
    res.status(403).send("You need to log in to view event details.");
  }
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
    event,
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
router.get("/logout", function (req, res) {
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
router.get("/oauth-redirect", function (req, res) {
  const stateFromServer = req.query.state;
  if (stateFromServer !== req.session.stateValue) {
    console.log("State doesn't match. uh-oh.");
    res.redirect(302, "/");
    return;
  }

  // Exchange OAuth code for access token and retrieve user
  client
    .exchangeOAuthCodeForAccessTokenUsingPKCE(
      req.query.code,
      clientId,
      clientSecret,
      "http://localhost:3000/oauth-redirect",
      req.session.verifier
    )
    .then((response) => {
      // Use JWT to retrieve user information
      return client.retrieveUserUsingJWT(response.response.access_token);
    })
    .then((response) => {
      const user = response.response.user;

      // Log the full user object to the terminal
      console.log("Logged in user:", JSON.stringify(user, null, 2));

      // Store the user information in the session
      req.session.user = user;
      req.session.customData = user.data; // Store custom data in session
      
      // Redirect user after login
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
      const is2FAEnabled =
        user.twoFactor &&
        user.twoFactor.methods &&
        user.twoFactor.methods.length > 0;

      // Log the twoFactor methods array to see the structure
      if (is2FAEnabled) {
        console.log("Two-Factor Methods:", user.twoFactor.methods);
      }

      res.render("profile", {
        user,
        is2FAEnabled, // Pass 2FA status to the profile template
      });
    })
    .catch((err) => {
      console.error("Error retrieving user:", err);
      res.redirect("/profile");
    });
});



// MFA Setup Route (POST)
router.post("/profile/mfa-setup", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/"); // Redirect if not logged in
  }

  // Generate a secret for the user
  client.generateTwoFactorSecret().then(response => {
    const secret = response.response.secretBase32Encoded;

    console.log("2FA Secret generated:", secret);
    req.session.twoFactorSecret = secret; // Store secret in the session

    // Send the secret and QR code back to the client
    res.json({
      secret,
      qrCodeUrl: `otpauth://totp/${req.session.user.username}?secret=${secret}&issuer=YourAppName`, // Customize issuer
    });
  }).catch(err => {
    console.error("Error generating 2FA secret:", err);
    res.status(500).json({ error: "Failed to generate secret." });
  });
});

// Verify and Enable MFA (POST)
router.post("/profile/mfa-verify", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/"); // Redirect if not logged in
  }

  const { totpCode } = req.body; // User-provided TOTP code
  const secret = req.session.twoFactorSecret; // Retrieved from the session
  const userId = req.session.user.id;

  // Verify the TOTP code
  client
    .verifyTwoFactorCode(userId, {
      code: totpCode,
      secret,
      method: "authenticator",
    })
    .then(() => {
      // Successfully verified, now update the user’s twoFactor object
      const twoFactor = {
        methods: [
          {
            method: "authenticator",
            secret: secret,
          },
        ],
      };

      // Update the user profile to include the twoFactor information
      return client.patchUser(userId, {
        user: {
          twoFactor: twoFactor,
        },
      });
    })
    .then(() => {
      console.log("2FA successfully enabled for user:", userId);
      req.session.user.twoFactor = {
        methods: [{ method: "authenticator" }],
      };
      res.redirect("/profile?success=true");
    })
    .catch((err) => {
      console.error("Error verifying/enabling 2FA:", err);
      res.redirect("/profile?error=true");
    });
});

router.delete("/profile/mfa-toggle", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authorized' }); // Ensure the user is logged in
  }

  const { totpCode } = req.body;  // The TOTP code the user provides
  const userId = req.session.user.id;  // The user's ID

  if (!totpCode) {
    return res.status(400).json({ error: 'TOTP code is required' });
  }

  // Step 1: Retrieve the user from FusionAuth to check two-factor details
  client.retrieveUser(userId)
    .then((response) => {
      const user = response.response.user;

      // Step 2: Check if user has any twoFactor methods and proceed
      if (user.twoFactor && user.twoFactor.methods && user.twoFactor.methods.length > 0) {
        // Step 3: Delete all the twoFactor methods by clearing the methods array
        return client.patchUser(userId, {
          user: {
            twoFactor: {
              methods: []  // Clear the methods array
            }
          }
        });
      } else {
        // If no two-factor methods exist, there's nothing to disable
        return Promise.reject(new Error('No two-factor methods enabled.'));
      }
    })
    .then(() => {
      console.log(`MFA disabled successfully for user: ${userId}`);
      req.session.user.twoFactor = null;  // Clear the twoFactor data in the session
      res.status(200).json({ message: 'MFA disabled successfully' });
    })
    .catch((error) => {
      console.error('Error disabling MFA:', error.response ? error.response.data : error.message);
      res.status(500).json({ error: 'Error disabling MFA' });
    });
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
    .then(() => {
      req.session.user.data = userData;
      res.redirect("/profile?success=true");
    })
    .catch((err) => {
      res.redirect("/profile");
    });
});

module.exports = router;
