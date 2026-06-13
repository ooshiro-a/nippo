/**
 * kgiDeadlineConfig.js - KGI項目別の達成期限マッピング
 * Nice Serviceman 日報
 *
 * 進捗タブの「必要ペース」表示で使用する、項目ごとの達成期限（暦日・当月の日付）。
 * ここに無いキーは「月末」が期限となる。
 * 実際の必要ペース計算では、ここで指定した期限の「2暦日前」を実質目標日として使う
 * （utils.js の getEffectiveTargetDate を参照）。
 */

const KGI_DEADLINE_CONFIG = {
  // 個人タブ
  maintenanceThisMonth: { day: 10 }, // 当月保守継続（当月継続）: 毎月10日までに実績化
  inspection:           { day: 15 }, // 点検件数: 毎月15日までに完了
  personalUnsettled:    { day: 20 }, // 個人末見額（当月末見通し）: 毎月20日までに100%達成
  officeUnsettled:      { day: 20 }, // 営業所末見額（当月末見通し）: 毎月20日までに100%達成

  // 営業所タブ
  office_renewalThis:   { day: 10 }, // 当月継続: 毎月10日までに実績化
  office_inspection:    { day: 15 }, // 点検: 毎月15日までに完了
  office_forecast:      { day: 20 }, // 末見通し（当月末見通し）: 毎月20日までに100%達成
};
