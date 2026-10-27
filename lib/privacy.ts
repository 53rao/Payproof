const prohibitedPaymentData = /(?:\d[ -]?){13,19}|\b(?:cvv|cvc|security code)\s*[:#-]?\s*\d{3,4}\b|\b(?:password|passcode|api[\s_-]?key|secret)\s*[:=]\s*\S+/i;

export function containsProhibitedPaymentData(value: string) {
  return prohibitedPaymentData.test(value);
}
