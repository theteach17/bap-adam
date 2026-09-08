/**
 * =========================================================================
 * [PERF PATCH v2.1.1] Per-execution memo cache
 * =========================================================================
 * วัตถุประสงค์:
 *   ลดจำนวน "round-trip" ไปยัง PropertiesService / SpreadsheetApp ภายใน
 *   การทำงาน 1 ครั้ง (1 execution ของ doGet หรือ google.script.run)
 *   โดยไม่เปลี่ยนตรรกะทางธุรกิจ ไม่เปลี่ยนสิทธิ์ และไม่เปลี่ยนโครงสร้างข้อมูลใด ๆ
 *
 * หลักความปลอดภัยที่ยึดถือ:
 *   1) แคชอยู่ในหน่วยความจำของ execution เท่านั้น ไม่เขียนลงชีต/Cache ภายนอก
 *   2) มี TTL 20 วินาที เป็นตาข่ายนิรภัย เผื่อกรณีที่ runtime นำ global scope
 *      กลับมาใช้ซ้ำ แคชจะหมดอายุเองเสมอ
 *   3) แคชที่ผูกกับ "ตัวตนผู้ใช้" (session/principal) จะตรวจ userKeyHash ซ้ำทุกครั้ง
 *      ถ้าคนละคนจะไม่มีทางได้ค่าของกันและกัน
 *   4) แคชรายการข้อมูล (rows:*) จะถูกล้างทันทีเมื่อมีการเขียน และถูกล้างซ้ำ
 *      ทุกครั้งที่ได้ Script Lock เพื่อให้ critical section อ่านข้อมูลสดเสมอ
 *      (พฤติกรรมเท่าเดิมกับก่อนแก้ทุกประการ)
 * =========================================================================
 */

var PC_MEMO_;

/** Returns the live memo store for this execution, auto-expiring after 20 seconds. */
function pcMemoStore_() {
  var now = Date.now();
  if (!PC_MEMO_ || !PC_MEMO_.at || (now - PC_MEMO_.at) > 20000) {
    PC_MEMO_ = { at: now, store: {} };
  }
  return PC_MEMO_.store;
}

/** Returns a memoized value, computing it once per execution. */
function pcMemo_(key, producer) {
  var store = pcMemoStore_();
  if (Object.prototype.hasOwnProperty.call(store, key)) return store[key];
  var value = producer();
  store[key] = value;
  return value;
}

/** Returns a memoized value that is only reused for the same identity key. */
function pcMemoScoped_(key, identity, producer) {
  var store = pcMemoStore_();
  var entry = store[key];
  if (entry && entry.__id === identity) return entry.value;
  var value = producer();
  store[key] = { __id: identity, value: value };
  return value;
}

/** Drops one memo entry. */
function pcMemoDrop_(key) {
  var store = pcMemoStore_();
  delete store[key];
}

/** Drops every memo entry whose key starts with a prefix. */
function pcMemoDropPrefix_(prefix) {
  var store = pcMemoStore_();
  Object.keys(store).forEach(function(key) {
    if (key.indexOf(prefix) === 0) delete store[key];
  });
}

/** Clears the whole memo, used after configuration or session mutations. */
function pcMemoReset_() {
  PC_MEMO_ = { at: Date.now(), store: {} };
}
