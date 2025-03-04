local http = game:GetService('HttpService')
local _get = http.GetAsync
local _post = http.PostAsync
local _decode = http.JSONDecode

local POST_METHODS = { 'POST', 'PUT', 'PATCH' }
local GET_METHODS = { 'GET', 'DELETE' }

local ProxyService = {}

local processBody = function(body)
  local success, data = pcall(_decode, http, body)
  if success and data then
    return {
      headers = data.headers or {},
      status = data.status or { code = 500, message = "Unknown Error" },
      body = data
    }
  else
    return {
      headers = {},
      status = { code = 500, message = "Invalid JSON response" },
      body = body
    }
  end
end

local httpGet = function(...)
  local body = _get(http, ...)
  return processBody(body)
end

local httpPost = function(...)
  local body = _post(http, ...)
  return processBody(body)
end

local getHeaders = function(this, method, target, headers, overrideProto)
  local sendHeaders = headers or {}
  sendHeaders['proxy-access-key'] = this.accessKey
  sendHeaders['proxy-target'] = target

  if overrideProto then
    sendHeaders['proxy-target-override-proto'] = overrideProto
  end
  if method ~= 'GET' and method ~= 'POST' then
    sendHeaders['proxy-target-override-method'] = method
  end

  -- Ensure API key for Roblox Open Cloud
  if not sendHeaders['x-api-key'] then
    sendHeaders['x-api-key'] = this.apiKey
  end

  return sendHeaders
end

local generatePostHandler = function(method)
  return function(self, target, path, data, contentType, compress, headers, overrideProto)
    local sendHeaders = getHeaders(self, method, target, headers, overrideProto)
    return httpPost(self.root .. path, data, contentType, compress, sendHeaders)
  end
end

local generateGetHandler = function(method)
  return function(self, target, path, nocache, headers, overrideProto)
    local sendHeaders = getHeaders(self, method, target, headers, overrideProto)
    return httpGet(self.root .. path, nocache, sendHeaders)
  end
end

local urlProcessor = function(callback)
  return function(self, url, ...)
    local _, endpos = url:find('://')
    local nextpos = url:find('/', endpos + 1) or #url + 1
    local target = url:sub(endpos + 1, nextpos - 1)
    local path = url:sub(nextpos)

    -- Handle Inventory and Users API
    if target == 'inventory.roblox.com' then
      target = 'apis.roblox.com'
      path = '/cloud/v2' .. path
    elseif target == 'users.roblox.com' then
      target = 'apis.roblox.com'
      path = '/cloud/v2' .. path
    end

    return callback(self, target, path, ...)
  end
end

local generateWithHandler = function(handler, method, handlerMethod)
  ProxyService[method:sub(1, 1):upper() .. method:sub(2):lower()] = urlProcessor(handler(method))
end

for _, method in next, POST_METHODS do
  generateWithHandler(generatePostHandler, method)
end
for _, method in next, GET_METHODS do
  generateWithHandler(generateGetHandler, method)
end

-- Function to get Inventory Items for a specific user
function ProxyService:GetInventoryItems(userId, headers)
  local path = string.format('/users/%s/inventory-items', userId)
  return self:Get('inventory.roblox.com', path, headers)
end

-- Function to get User Information for a specific user
function ProxyService:GetUserInfo(userId, headers)
  local path = string.format('/v1/users/%s', userId)
  return self:Get('users.roblox.com', path, headers)
end

function ProxyService:New(root, accessKey, apiKey)
  if root:sub(#root, #root) == '/' then
    root = root:sub(1, #root - 1)
  end
  if not root:find('^http[s]?://') then
    error('Root must include http:// or https:// at the beginning')
  end
  self.root = root
  self.accessKey = accessKey
  self.apiKey = apiKey
  return self
end

return ProxyService
