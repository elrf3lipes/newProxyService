# newProxyService

A lightweight proxy service for routing and authenticating API requests to Roblox endpoints.

This project is a streamlined update of the original [ProxyService](https://github.com/sentanos/ProxyService), revised to reflect recent changes in the Roblox API and now leverages the [Open Cloud](https://create.roblox.com/docs/en-us/cloud/reference/openapi) platform.

## Features

- **Full HTTP Support:** Enables GET, POST, PUT, PATCH, and DELETE requests.
- **Enhanced Responses:** Returns full response data including status codes, headers, and body.
- **Open Cloud Integration:** Updated for the new Roblox API structure via Open Cloud.
   
   ## Deploying on Heroku

This project is also ready for deployment on Heroku. A `Procfile` is already included to run `server.js`.

### Steps to Deploy:
1. **Click the Button Below to Deploy Automatically:**  
   [![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/elrf3lipes/newProxyService)
   
2. **Configure Environment Variables:**  
   Once deployed, set the following required variables in your Heroku app’s settings:
   - `ACCESS_KEY` – A secret key used to authenticate incoming requests.
   - `ROBLOX_API_KEY` – Your Roblox Open Cloud API key.
   - `GZIP_METHOD` – Must be one of: `"transform"`, `"decode"`, or `"append"`.
   - *(Optional)* `USE_WHITELIST`, `ALLOWED_HOSTS`, `USE_OVERRIDE_STATUS`, `REWRITE_ACCEPT_ENCODING`, and `APPEND_HEAD` if you need custom behavior.

3. **Run 24/7:**  
   To ensure your proxy stays online around the clock, add a credit card to your Heroku account to prevent dyno sleeping.

---

## Example Usage

### Server (Heroku Deployment)
Once your server is deployed, it listens on the port defined by the Heroku environment. All incoming requests must include the following HTTP headers:
- `proxy-access-key` – Your secret `ACCESS_KEY`
- `proxy-target` – The full target URL (without protocol adjustments)  
Additional optional headers include `proxy-target-override-proto` and `proxy-target-override-method`.

### Client (Roblox) Usage
Place the [ProxyService.mod.lua](client/ProxyService.mod.lua) module in your Roblox project. Then, use it as shown below:

```lua
-- Require the module (adjust the path as needed)
local ProxyService = require(game:GetService("ServerScriptService").ProxyService)

-- Create a proxy instance
-- Replace YOUR_HEROKU_APP with your Heroku app’s domain,
-- YOUR_ACCESS_KEY with your ACCESS_KEY, and YOUR_ROBLOX_API_KEY with your Roblox API key.
local Proxy = ProxyService:New("https://YOUR_HEROKU_APP.herokuapp.com", "YOUR_ACCESS_KEY", "YOUR_ROBLOX_API_KEY")

-- Example: Get catalog item details by category and creator name
local category = 3  -- Example category ID
local creatorName = "ExampleCreator"
local endpoint = string.format("/v1/search/items/details?Category=%d&CreatorName=%s", category, creatorName)

local response = Proxy:Get("https://catalog.roproxy.com", endpoint)
print("Catalog Items:", response.body)
```

This setup lets your Roblox game bypass the limitations of HttpService by routing requests through your Heroku-hosted proxy server.

---