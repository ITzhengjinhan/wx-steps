const express = require("express");
const httpport = 3100;
// const httpsport = 3101;
const fs = require("fs");
const crypto = require("crypto");
const Axios = require("axios");
const dayjs = require("dayjs");
let isEmail = true;
let config = {};
// var https = require("https");
var http = require("http");

//同步读取密钥和签名证书
// var options = {
//   key: fs.readFileSync("./privkey.pem"),
//   cert: fs.readFileSync("./fullchain.pem"),
// };

var app = express();
// var httpsServer = https.createServer(options, app);
var httpServer = http.createServer(app);

process.on("unhandledRejection", function(err) {
  console.error("unhandledRejection", err);
});
process.on("uncaughtException", function(err) {
  console.error("uncaughtException", err);
});

// 允许跨域访问
app.all("*", function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
  // res.header("Content-Type", "application/json;charset=utf-8");
  next();
});

app.use(express.json()); // for parsing application/json

// 公共头
const COMMON_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
  "User-Agent": "MiFit/4.6.0 (iPhone; iOS 14.0.1; Scale/2.00)",
};

// 2025-09 起，明文登录 api-user.huami.com/registrations 会固定返回 429 / code 12。
// 现用 Zepp 登录：表单 AES-128-CBC 加密后提交，密钥与客户端一致。
const LOGIN_AES_KEY = Buffer.from("xeNtBVqzDc6tuNTh");
const LOGIN_AES_IV = Buffer.from("MAAAYAAAAAAAAABg");
const LOGIN_APP = "com.xiaomi.hm.health";
const DEVICE_ID = "2C8B4939-0CCD-4E94-8CBA-CB8EA6E613A1";

function encryptLoginBody(params) {
  const cipher = crypto.createCipheriv("aes-128-cbc", LOGIN_AES_KEY, LOGIN_AES_IV);
  return Buffer.concat([
    cipher.update(Buffer.from(params.toString(), "utf8")),
    cipher.final(),
  ]);
}

function accountName(username) {
  isEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(username);
  if (isEmail || String(username).startsWith("+")) return username;
  return "+86" + username;
}

// axios配置
const axios = Axios.create({
  timeout: 30000,
  headers: {
    ...COMMON_HEADERS,
  },
});

// 路由
app.post("/run", async function(req, response, next) {
  const body = req.body || {};
  config = {
    username: body.phoneNumber,
    password: body.password,
    step_size: body.steps,
    user_id: "",
    app_token: "",
    ticket: body.ticket, // 登录过的凭证
  };
  accountName(config.username || "");
  console.log("config", {
    username: config.username,
    step_size: config.step_size,
    hasTicket: Boolean(config.ticket),
  });
  try {
    if (config.ticket) {
      // 有凭证，通过凭证获取token
      const { app_token, user_id, code: resCode } = await getAccessToken(
        config.ticket,
      );
      if (resCode === "402") {
        if (!response.headersSent) {
          response.status(200).send({
            err: "登录凭证已失效",
            code: "402",
          });
        }
        return;
      }
      config.app_token = app_token;
      config.user_id = user_id;
      const step = config.step_size;
      await pushBandData(step, config.user_id, config.app_token, config.ticket);
    } else {
      // 无凭证，走登录逻辑
      await run(config);
    }
  } catch (e) {
    console.error(e);
    if (!response.headersSent) {
      response.status(200).send({ err: "请求失败", code: "500" });
    }
  }
  async function run(config) {
    const code = await loginByPassword(config.username, config.password);
    if (!code) return;
    const tokenInfo = await getAccessToken(code);
    if (!tokenInfo || !tokenInfo.app_token) {
      if (!response.headersSent) {
        response.status(200).send({
          err: (tokenInfo && tokenInfo.err) || "获取登录令牌失败",
          code: "402",
        });
      }
      return;
    }
    config.app_token = tokenInfo.app_token;
    config.user_id = tokenInfo.user_id;
    const step = config.step_size;
    await pushBandData(step, config.user_id, config.app_token, code);
  }

  function toUrlEncode(obj) {
    const data = new URLSearchParams();
    const keys = Object.keys(obj);
    keys.forEach((key) => data.append(key, obj[key]));
    return data;
  }

  async function getAccessToken(code) {
    const data = toUrlEncode(
      isEmail
        ? {
            allow_registration: "false",
            app_name: LOGIN_APP,
            app_version: "6.14.0",
            code: code,
            country_code: "CN",
            device_id: DEVICE_ID,
            device_model: "android_phone",
            dn: "account.zepp.com,api-user.zepp.com,api-mifit.zepp.com,api-watch.zepp.com,app-analytics.zepp.com,api-analytics.huami.com,auth.zepp.com",
            grant_type: "access_token",
            lang: "zh_CN",
            os_version: "1.5.0",
            source: "com.xiaomi.hm.health:6.14.0:50818",
            third_name: "email",
          }
        : {
            app_name: LOGIN_APP,
            app_version: "6.14.0",
            code: code,
            country_code: "CN",
            device_id: DEVICE_ID,
            device_model: "phone",
            grant_type: "access_token",
            third_name: "huami_phone",
          },
    );
    try {
      const res = await axios.post(
        "https://account.huami.com/v2/client/login",
        data,
        {
          headers: {
            app_name: LOGIN_APP,
            appname: LOGIN_APP,
            appplatform: "android_phone",
            cv: "50818_6.14.0",
            v: "2.0",
            "accept-language": "zh-CN",
            "x-request-id": crypto.randomBytes(16).toString("hex"),
          },
          validateStatus: () => true,
        },
      );
      const token_info = res.data && res.data.token_info;
      if (res.status === 200 && token_info && token_info.app_token) {
        return token_info;
      }
      const detail =
        (res.data && (res.data.message || res.data.result || res.data.error_code)) ||
        res.status;
      console.log("获取AccessToken失败", detail);
      return { err: "获取AccessToken失败", code: "402" };
    } catch (e) {
      console.log("获取AccessToken失败", e.message);
      return { err: "获取AccessToken失败", code: "402" };
    }
  }

  async function loginByPassword(username, password) {
    const redirectUri =
      "https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html";
    const account = accountName(username);
    const form = toUrlEncode({
      emailOrPhone: account,
      password: password,
      state: "REDIRECTION",
      client_id: "HuaMi",
      country_code: "CN",
      token: "access",
      redirect_uri: redirectUri,
    });
    try {
      const res = await axios.post(
        "https://api-user.zepp.com/v2/registrations/tokens",
        encryptLoginBody(form),
        {
          maxRedirects: 0,
          validateStatus: () => true,
          transformRequest: [(body) => body],
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": "MiFit6.14.0 (M2007J1SC; Android 12; Density/2.75)",
            app_name: LOGIN_APP,
            appname: LOGIN_APP,
            appplatform: "android_phone",
            "x-hm-ekv": "1",
            "hm-privacy-ceip": "false",
          },
        },
      );
      const location = (res.headers && res.headers.location) || "";
      const upstream = res.data;
      const limited =
        res.status === 429 ||
        (upstream &&
          typeof upstream === "object" &&
          (upstream.code === 12 || upstream.message === "too many requests"));
      if (limited) {
        sendLoginError("请求过于频繁，请稍后再试", "429", res.status);
        return null;
      }
      let params;
      try {
        params = new URL(location, redirectUri).searchParams;
      } catch (e) {
        params = new URLSearchParams();
      }
      if (params.get("access")) {
        console.log("获取登录授权码成功");
        return params.get("access");
      }
      const errorCode = params.get("error");
      const err =
        errorCode === "401"
          ? "登录失败， 请检查账号密码"
          : "获取登录授权码失败";
      sendLoginError(err, errorCode === "401" ? "401" : "401", res.status);
      return null;
    } catch (e) {
      console.log("登录请求失败", e.message);
      sendLoginError("登录失败， 请检查账号密码", "401");
      return null;
    }
  }

  function sendLoginError(err, code, status) {
    console.log(err, status || "");
    if (!response.headersSent) {
      response.status(200).send({ err, code });
    }
  }

  async function pushBandData(step, user_id, app_token, ticket) {
    const data = toUrlEncode({
      userid: user_id,
      last_sync_data_time: 1597306380,
      device_type: 0,
      last_deviceid: "DA932FFFFE8816E7",
      data_json: await buildDataJson(step),
    });

    try {
      const res = await axios.post(
        `https://api-mifit-cn.huami.com/v1/data/band_data.json?&t=${Date.now()}`,
        data,
        {
          headers: {
            apptoken: app_token,
          },
        },
      );
      response
        .status(200)
        .send({ success: "刷步数成功！", code: "200", ticket });
      console.log(`上传步数成功 step：${step}`);
    } catch (e) {
      console.log("上传步数失败");
      if (!response.headersSent) {
        response.status(200).send({ err: "上传步数失败", code: "403" });
      }
    }
  }

  async function buildDataJson(step) {
    const time = dayjs().format("YYYY-MM-DD");
    const find_date = /.*?date":"(.*?)","data.*?/;
    const find_step = /.*?ttl\\":(.*?),\\"dis.*?/;

    data_json = fs.readFileSync("./data.json", "utf-8");
    data_json = data_json.replace(find_date.exec(data_json)[1], time);
    data_json = data_json.replace(find_step.exec(data_json)[1], step);
    return data_json;
  }
});

httpServer.listen(httpport, () => {
  console.log(`Example app listening at http://localhost:${httpport}`);
});

// httpsServer.listen(httpsport, () => {
// 	console.log(`Example app listening at https://localhost:${httpsport}`)
// })
