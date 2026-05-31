var DAYREPORT_MAP = {
  sheetName: "一枚目 ", // 末尾スペース注意
  rows: {
    office: { top: 17, sales: 35 },
    members: [
      { id: "a", top:  8, sales: 25, shortfallCell: "C39", nameCell: "A39" },
      { id: "b", top:  9, sales: 26, shortfallCell: "C40", nameCell: "A40" },
      { id: "c", top: 10, sales: 27, shortfallCell: "C41", nameCell: "A41" },
      { id: "d", top: 11, sales: 28, shortfallCell: "C42", nameCell: "A42" },
      { id: "e", top: 12, sales: 29, shortfallCell: "C43", nameCell: "A43" }
    ]
  },
  cols: {
    top: {
      activityDays:         "B",
      activityCount:        "C",
      promotionCount:       "D",
      promotionAcase:       "E",
      inspectionPlan:       "F",
      inspectionActual:     "G",
      renewalNextPlanTop:   "H",
      renewalNextActualTop: "I"
    },
    sales: {
      salesPlan:          "B",
      salesActual:        "C",
      salesAcase:         "H",
      salesForecast:      "J",
      vsPlan:             "L",
      maintActual:        "M",
      maintNew:           "N",
      maintCont:          "O",
      totalMaintPlan:     "S",
      totalMaintActual:   "T",
      newMaintPlan:       "V",
      newMaintActual:     "W",
      renewalThisPrev:    "AD",
      renewalThisPlan:    "AE",
      renewalThisActual:  "AF",
      nextMonthBacklog:   "AG",
      nextMonthCase:      "AI",
      renewalNext2Plan:   "AM",
      renewalNext2Actual: "AN",
      renewalNext2Rate:   "AO"
    }
  },
  singletons: {
    renewalRate: "AE37"
  }
};

var SALESPLAN_MAP = {
  sheetName: '売上計画',
  rows: {
    office:  { personal: 19, paid: 32, other: 45 },
    members: [
      { id: 'a', personal: 11, paid: 24, other: 37 },
      { id: 'b', personal: 12, paid: 25, other: 38 },
      { id: 'c', personal: 13, paid: 26, other: 39 },
      { id: 'd', personal: 14, paid: 27, other: 40 },
      { id: 'e', personal: 15, paid: 28, other: 41 },
    ]
  },
  cols: {
    personal: {
      renewalTargetUnits:  'B',
      renewalPlanUnits:    'D',
      renewalPlanAmount:   'E',
      newPlanUnits:        'F',
      newPlanAmount:       'G',
      inspectionPlanUnits: 'H',
      prepaidNewAmount:    'K',
      prepaidContAmount:   'M'
    },
    paid: {
      callOwnAmount:   'E',
      callOtherAmount: 'G',
      repairSerAmount: 'I',
      serPromoAmount:  'K'
    },
    other: {
      totalSalesPlan: 'H'
    }
  },
  singletons: {
    yearMonth_year:  'A5',
    yearMonth_month: 'D5',
    annualSalesPlan: 'F47'
  }
};
