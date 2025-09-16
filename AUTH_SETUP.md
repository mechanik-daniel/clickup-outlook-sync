# Outlook API Authentication Setup Guide

This guide explains how to register your app in Azure AD and obtain the credentials and refresh token needed for Outlook calendar sync. It covers platform choice, redirect URI, and common issues.

## 1. Register Your App in Azure AD
1. Go to https://portal.azure.com
2. Navigate to **Azure Active Directory > App registrations > New registration**
3. **Name**: Choose a name for your app
4. **Supported account types**: Choose as needed (usually "Accounts in this organizational directory only")
5. **Platform**: Select **Web** (not Public client/native)
6. **Redirect URI**: Enter `http://localhost` (for local development)
7. Click **Register**

## 2. Get Your Credentials
- **Client ID**: Found on the app’s Overview page as "Application (client) ID"
- **Tenant ID**: Found on the app’s Overview page as "Directory (tenant) ID"
- **Client Secret**:
  - Go to **Manage > Certificates & secrets > New client secret**
  - Add a description and expiration, then click **Add**
  - Copy the content of the `value` column (*NOT* `Secret ID`), **you won’t see it again (!)** ()

## 3. API Permissions
- Go to **API permissions**
- Click **Add a permission > Microsoft Graph > Delegated permissions**
- Add: `offline_access`, `Calendars.Read`
- Click **Grant admin consent** if possible

## 4. OAuth2 Authorization Flow
### Step 1: Get Authorization Code
- Build this URL (replace values):

```
https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize?client_id={CLIENT_ID}&response_type=code&redirect_uri=http://localhost&response_mode=query&scope=offline_access%20Calendars.Read&state=12345
```
- Paste the URL in your browser and log in.
- You’ll be redirected to `http://localhost` (which will show an error page: "refused to connect").
- **Important:** The browser’s address bar will contain `?code=...` — copy the code value.

### Step 2: Exchange Code for Tokens (in Postman)
- Create a new POST request to:

```
https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token
```
- Set body type to `x-www-form-urlencoded` and add:
    - `client_id`: Your client ID
    - `scope`: `offline_access Calendars.Read`
    - `code`: The code from step 1
    - `redirect_uri`: `http://localhost`
    - `grant_type`: `authorization_code`
    - `client_secret`: Your client secret
- Send the request. The response will include `access_token` and `refresh_token`.
- Copy the `refresh_token` to your `.env` as `OUTLOOK_REFRESH_TOKEN`.

## 5. Common Issues
- **Platform Choice:**
  - If you choose "Public client/native", you cannot use a client secret and will get `invalid_client` errors.
  - Always choose **Web** for this app.
- **Redirect URI:**
  - Using `http://localhost` is fine; you will always get a browser error page, but the code is in the URL.
- **Token Expiry:**
  - You only need to do this process again if the refresh token expires or is revoked.

## 6. Summary
- Register app as **Web** platform
- Use `http://localhost` as redirect URI
- Get credentials and permissions
- Use browser and Postman to get refresh token
- Store refresh token in `.env`

---
This guide is for developers and Copilot agents working on the Outlook-ClickUp sync tool.
