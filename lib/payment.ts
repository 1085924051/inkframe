import { createDecipheriv, createPrivateKey, createPublicKey, randomBytes, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import QRCode from "qrcode";
import { prisma } from "./prisma";
import { getModelConfigValue } from "./settings";

export type PaymentProvider = "mock" | "alipay" | "wechat";
export type PaymentOrderView = { orderNo: string; provider: PaymentProvider; subject: string; amountMicros: number; creditMicros: number; status: string; qrCode?: string | null; expiresAt: string; paidAt?: string | null; createdAt: string };

const PAYMENT_PROVIDERS = new Set<PaymentProvider>(["mock", "alipay", "wechat"]);
const DEFAULT_EXPIRY_MS = 15 * 60 * 1000;

function pem(value: string) { return value.replace(/\\n/g, "\n").trim(); }
function configValue(key: string) { return getModelConfigValue(key); }
function amountToFen(amountMicros: number) { return Math.max(1, Math.round(amountMicros / 10_000)); }
function fenToMicros(fen: number) { return Math.round(fen * 10_000); }
function yuanToMicros(value: unknown) { const amount = Number(value); return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 1_000_000) : 0; }
function orderNumber() { return `IF${Date.now()}${randomBytes(4).toString("hex").toUpperCase()}`; }

function signContent(params: Record<string, string>) {
  return Object.keys(params).filter((key) => params[key] !== "" && key !== "sign" && key !== "sign_type").sort().map((key) => `${key}=${params[key]}`).join("&");
}

function alipaySignature(params: Record<string, string>, privateKey: string) {
  return cryptoSign("RSA-SHA256", Buffer.from(signContent(params), "utf8"), createPrivateKey(pem(privateKey))).toString("base64");
}

function verifyAlipay(params: Record<string, string>, publicKey: string) {
  const signature = params.sign;
  if (!signature) return false;
  return cryptoVerify("RSA-SHA256", Buffer.from(signContent(params), "utf8"), createPublicKey(pem(publicKey)), Buffer.from(signature, "base64"));
}

async function qrDataUrl(content: string) {
  return QRCode.toDataURL(content, { width: 260, margin: 2, errorCorrectionLevel: "M" });
}

async function createAlipayOrder(orderNo: string, subject: string, amountMicros: number) {
  const [appId, privateKey, gateway, notifyUrl] = await Promise.all([configValue("ALIPAY_APP_ID"), configValue("ALIPAY_PRIVATE_KEY"), configValue("ALIPAY_GATEWAY_URL"), configValue("ALIPAY_NOTIFY_URL")]);
  if (!appId || !privateKey || !notifyUrl) throw new Error("支付宝支付未配置完整：需要 App ID、应用私钥和异步回调地址");
  const params: Record<string, string> = { app_id: appId, method: "alipay.trade.precreate", format: "JSON", charset: "utf-8", sign_type: "RSA2", timestamp: new Date().toISOString().slice(0, 19).replace("T", " "), version: "1.0", notify_url: notifyUrl, biz_content: JSON.stringify({ out_trade_no: orderNo, subject, total_amount: (amountMicros / 1_000_000).toFixed(2), product_code: "FACE_TO_FACE_PAYMENT" }) };
  params.sign = alipaySignature(params, privateKey);
  const response = await fetch(gateway || "https://openapi.alipay.com/gateway.do", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, body: new URLSearchParams(params), cache: "no-store" });
  if (!response.ok) throw new Error(`支付宝下单失败：HTTP ${response.status}`);
  const data = await response.json() as { alipay_trade_precreate_response?: { code?: string; msg?: string; sub_msg?: string; qr_code?: string } };
  const result = data.alipay_trade_precreate_response;
  if (!result?.qr_code) throw new Error(`支付宝下单失败：${result?.sub_msg || result?.msg || "未返回二维码"}`);
  return result.qr_code;
}

function wechatAuthorization(method: string, url: URL, body: string, mchId: string, serialNo: string, privateKey: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const message = `${method}\n${url.pathname}${url.search}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = cryptoSign("RSA-SHA256", Buffer.from(message, "utf8"), createPrivateKey(pem(privateKey))).toString("base64");
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`;
}

async function createWechatOrder(orderNo: string, subject: string, amountMicros: number) {
  const [appId, mchId, serialNo, privateKey, notifyUrl, baseUrl] = await Promise.all([configValue("WECHAT_APP_ID"), configValue("WECHAT_MCH_ID"), configValue("WECHAT_SERIAL_NO"), configValue("WECHAT_PRIVATE_KEY"), configValue("WECHAT_NOTIFY_URL"), configValue("WECHAT_API_URL")]);
  if (!appId || !mchId || !serialNo || !privateKey || !notifyUrl) throw new Error("微信支付未配置完整：需要 App ID、商户号、证书序列号、商户私钥和异步回调地址");
  const url = new URL("/v3/pay/transactions/native", baseUrl || "https://api.mch.weixin.qq.com");
  const body = JSON.stringify({ appid: appId, mchid: mchId, description: subject, out_trade_no: orderNo, notify_url: notifyUrl, amount: { total: amountToFen(amountMicros), currency: "CNY" } });
  const response = await fetch(url, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: wechatAuthorization("POST", url, body, mchId, serialNo, privateKey) }, body, cache: "no-store" });
  if (!response.ok) throw new Error(`微信支付下单失败：HTTP ${response.status} ${(await response.text()).slice(0, 240)}`);
  const data = await response.json() as { code_url?: string; message?: string };
  if (!data.code_url) throw new Error(`微信支付下单失败：${data.message || "未返回二维码"}`);
  return data.code_url;
}

export async function paymentProvider() {
  const configured = (await configValue("PAYMENT_PROVIDER")) as PaymentProvider;
  return PAYMENT_PROVIDERS.has(configured) ? configured : "mock";
}

export async function createPaymentOrder(input: { userId: string; provider?: PaymentProvider; amountMicros: number; subject?: string }) {
  const provider = input.provider && PAYMENT_PROVIDERS.has(input.provider) ? input.provider : await paymentProvider();
  if (input.amountMicros < 1_000_000 || input.amountMicros > 2_000_000_000) throw new Error("充值金额需在 1 元到 2000 元之间");
  const orderNo = orderNumber();
  const subject = (input.subject || "InkFrame 创作额度").slice(0, 80);
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_MS);
  const order = await prisma.paymentOrder.create({ data: { orderNo, userId: input.userId, provider, subject, amountMicros: input.amountMicros, creditMicros: input.amountMicros, expiresAt } });
  try {
    const content = provider === "alipay" ? await createAlipayOrder(orderNo, subject, input.amountMicros) : provider === "wechat" ? await createWechatOrder(orderNo, subject, input.amountMicros) : `inkframe://mock-payment/${orderNo}`;
    const qrCode = await qrDataUrl(content);
    const updated = await prisma.paymentOrder.update({ where: { id: order.id }, data: { qrCode } });
    return toPaymentOrderView(updated);
  } catch (error) {
    await prisma.paymentOrder.update({ where: { id: order.id }, data: { status: "failed", rawPayload: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) } });
    throw error;
  }
}

export function toPaymentOrderView(order: { orderNo: string; provider: string; subject: string; amountMicros: number; creditMicros: number; status: string; qrCode: string | null; expiresAt: Date; paidAt: Date | null; createdAt: Date }): PaymentOrderView {
  return { orderNo: order.orderNo, provider: order.provider as PaymentProvider, subject: order.subject, amountMicros: order.amountMicros, creditMicros: order.creditMicros, status: order.status, qrCode: order.qrCode, expiresAt: order.expiresAt.toISOString(), paidAt: order.paidAt?.toISOString() || null, createdAt: order.createdAt.toISOString() };
}

export async function markPaymentPaid(orderNo: string, providerTradeNo: string, paidAmountMicros: number, rawPayload: unknown) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.paymentOrder.findUnique({ where: { orderNo } });
    if (!order) throw new Error("支付订单不存在");
    if (order.status === "paid") return order;
    if (order.status !== "pending") throw new Error("支付订单当前不可入账");
    if (Math.abs(order.amountMicros - paidAmountMicros) > 10_000) throw new Error("支付金额与订单金额不一致");
    const user = await tx.user.update({ where: { id: order.userId }, data: { balanceMicros: { increment: order.creditMicros } } });
    const paid = await tx.paymentOrder.update({ where: { id: order.id }, data: { status: "paid", providerTradeNo, paidAt: new Date(), rawPayload: JSON.stringify(rawPayload).slice(0, 20000) } });
    await tx.walletTransaction.create({ data: { userId: order.userId, orderId: order.id, type: "recharge", amountMicros: order.creditMicros, balanceAfterMicros: user.balanceMicros, description: `${order.subject} · ${order.provider}` } });
    return paid;
  });
}

export async function mockCompletePayment(orderNo: string) {
  const order = await prisma.paymentOrder.findUnique({ where: { orderNo } });
  if (!order || order.provider !== "mock") throw new Error("Mock 订单不存在");
  return markPaymentPaid(orderNo, `mock-${orderNo}`, order.amountMicros, { mock: true });
}

export async function verifyAndCompleteAlipay(form: Record<string, string>) {
  const publicKey = await configValue("ALIPAY_PUBLIC_KEY");
  if (!publicKey || !verifyAlipay(form, publicKey)) throw new Error("支付宝回调验签失败");
  const tradeStatus = form.trade_status;
  if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") return null;
  return markPaymentPaid(form.out_trade_no, form.trade_no, yuanToMicros(form.total_amount), form);
}

function headerValue(headers: Headers, name: string) { return headers.get(name) || headers.get(name.toLowerCase()) || ""; }

function verifyWechat(headers: Headers, body: string, certificate: string) {
  const timestamp = headerValue(headers, "Wechatpay-Timestamp");
  const nonce = headerValue(headers, "Wechatpay-Nonce");
  const signature = headerValue(headers, "Wechatpay-Signature");
  if (!timestamp || !nonce || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  return cryptoVerify("RSA-SHA256", Buffer.from(`${timestamp}\n${nonce}\n${body}\n`, "utf8"), createPublicKey(pem(certificate)), Buffer.from(signature, "base64"));
}

function decryptWechatResource(resource: { ciphertext: string; nonce: string; associated_data?: string }, apiV3Key: string) {
  const ciphertext = Buffer.from(resource.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), Buffer.from(resource.nonce, "utf8"));
  decipher.setAAD(Buffer.from(resource.associated_data || "", "utf8"));
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  return JSON.parse(Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]).toString("utf8")) as { out_trade_no?: string; transaction_id?: string; amount?: { total?: number } };
}

export async function verifyAndCompleteWechat(headers: Headers, body: string) {
  const certificate = await configValue("WECHAT_PLATFORM_CERTIFICATE");
  const apiV3Key = await configValue("WECHAT_API_V3_KEY");
  if (!certificate || !apiV3Key || !verifyWechat(headers, body, certificate)) throw new Error("微信支付回调验签失败");
  const payload = JSON.parse(body) as { resource?: { ciphertext: string; nonce: string; associated_data?: string } };
  if (!payload.resource) throw new Error("微信支付回调缺少 resource");
  const result = decryptWechatResource(payload.resource, apiV3Key);
  if (!result.out_trade_no || !result.transaction_id || !result.amount?.total) throw new Error("微信支付回调内容不完整");
  return markPaymentPaid(result.out_trade_no, result.transaction_id, fenToMicros(result.amount.total), result);
}

export async function debitBalance(input: { userId: string; amountMicros: number; description: string; metadata?: unknown }) {
  if (input.amountMicros <= 0) return null;
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId }, select: { balanceMicros: true } });
    if (!user || user.balanceMicros < input.amountMicros) throw new Error("余额不足，请先充值后再生成");
    const updated = await tx.user.update({ where: { id: input.userId }, data: { balanceMicros: { decrement: input.amountMicros } } });
    return tx.walletTransaction.create({ data: { userId: input.userId, type: "usage", amountMicros: -input.amountMicros, balanceAfterMicros: updated.balanceMicros, description: input.description, metadata: input.metadata ? JSON.stringify(input.metadata).slice(0, 20000) : undefined } });
  });
}

export async function billingEnforced() { return (await configValue("BILLING_ENFORCE_BALANCE")).toLowerCase() === "true"; }
