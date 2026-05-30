/**
 * Africa's Talking SMS endpoint — sandbox vs live use different hosts.
 * USSD does not use this; only outbound SMS.
 * @see https://developers.africastalking.com/docs/sms/overview
 */

export function atMessagingUrl(username: string): string {
  const isSandbox = (username || "sandbox") === "sandbox";
  return isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
}
