const areaId = "NO1";
const vatMultiplier = 1.25;
const stateFees = 0.75 + 0.05;
const providerAdjustment = 0;
const graphWidth = 460;
const graphHeight = 80;
const prevHours = 2;
const postHours = 12;
const useBars = true;

let widget = await createWidget();

// Check where the script is running
if (config.runsInWidget) {
  // Runs inside a widget so add it to the homescreen widget
  Script.setWidget(widget);
} else {
  // Show the medium widget inside the app
  widget.presentSmall();
}
Script.complete();

function formatPrice(value) {
  return calcPrice(value).toFixed(0);
}

function calcPrice(value) {
  return (value[1] + stateFees + providerAdjustment) * vatMultiplier / 10;
}

function zp(v, len) {
  let s = typeof v == "number" ? v.toFixed(0).toString() : v.toString();
  while (s.length < len) s = "0" + s;
  return s;
}

function formatTime(value, short) {
  let d = new Date(value[0]);
  return zp(d.getHours(), 2)
    + (short ? "" : ':' + zp(d.getMinutes(), 2));
}

async function getSpotPrices(areaId, date) {
  try {
    const req = new Request("https://spoox.org/spot." + date + ".json")
    const res = await req.loadJSON();
    return res[areaId];
  } catch (e) {
    return {
      id: areaId,
      title: "",
      values: []
    }
  }
}

function makeGraphValues(values, nowTime, width, height) {

  let maxValue = Number.MIN_VALUE;
  let minValue = Number.MAX_VALUE;
  let minIndex, maxIndex;
  let minTime, maxTime;

  values.forEach((value, i) => {
    if (value[0] < nowTime) return;
    if (value[1] > maxValue) {
      maxTime = value[0];
      maxValue = value[1];
      maxIndex = i;
    }
    if (value[1] < minValue) {
      minTime = value[0];
      minValue = value[1];
      minIndex = i;
    }
  })

  let startTime = values[0][0];
  let endTime = values[values.length - 1][0];
  if (useBars) endTime += 1 * 60 * 60 * 1000;
  let timeRange = (endTime - startTime);

  let valueRange = (maxValue - minValue);

  return {
    max: {
      value: values[maxIndex],
      index: maxIndex,
      x: Math.round(((maxTime - startTime) / timeRange) * width)
    },
    min: {
      value: values[minIndex],
      index: minIndex,
      x: Math.round(((minTime - startTime) / timeRange) * width),
    },
    now: {
      x: Math.round(((nowTime - startTime) / timeRange) * width),
    },
    points: values.map((value, i) => {
      let t = value[0];
      let x = Math.round(((t - startTime) / timeRange) * width);
      let y = height - 1 - Math.round(((value[1] - minValue) / valueRange) * (height - 2));
      return [x, y]
    })
  };
}

function drawGraphValues(graph, width, height) {

  let draw = new DrawContext();

  draw.opaque = false;

  draw.size = new Size(width, height);

  draw.setLineWidth(10);

  /*
  let minPath = new Path();
  minPath.move(new Point(graph.min.x, 0));
  minPath.addLine(new Point(graph.min.x, height));
  draw.setStrokeColor(new Color("#00FF00"));
  draw.addPath(minPath);
  draw.strokePath();
  */

  let nowPath = new Path();
  nowPath.move(new Point(graph.now.x, 0));
  nowPath.addLine(new Point(graph.now.x, height));
  draw.setStrokeColor(new Color("#999933"));
  draw.addPath(nowPath);
  draw.strokePath();

  let maxPath = new Path();
  maxPath.move(new Point(graph.max.x, 0));
  maxPath.addLine(new Point(graph.max.x, height));
  draw.setStrokeColor(new Color("#FF0000"));
  draw.addPath(maxPath);
  draw.strokePath();

  draw.setLineWidth(5);

  let graphPath = new Path();
  graph.points.forEach((point, i) => {
    let [x, y] = point;
    if (i == 0) graphPath.move(new Point(x, y));
    else graphPath.addLine(new Point(x, y));
    if (useBars) {
      let x2 = graph.points[i + 1] ? graph.points[i + 1][0] : width;
      graphPath.addLine(new Point(x2, y))
    }
  });
  draw.setStrokeColor(new Color("#999999"));
  draw.addPath(graphPath);
  draw.strokePath();

  return draw.getImage();
}

function alignTime(time) {
  let extra = time % 60 * 60 * 1000;
  return time - extra;
}

function alignDay(time) {
  let d = new Date(time - (time % 1000));
  let t = d.getTime() - (d.getHours() * 60 * 60 * 1000) - (d.getMinutes() * 60 * 1000) - (d.getSeconds() * 1000);
  console.log(new Date(t));
  return t;
}

function extractValues(values, now) {

  let now0 = alignTime(now);
  let startTime = now0 - 60 * 60 * 1000 * prevHours;
  let endTime = now0 + 60 * 60 * 1000 * postHours;

  /*
  let now0 = alignDay(now);
  let startTime = now0;
  let endTime = now0 + 24*60*60*1000;
  */

  let filteredValues = values.filter(value => {
    return value[0] >= startTime && endTime > value[0];
  })
  console.log({ now, now0, startTime, endTime, filteredValues });
  return filteredValues;
}

function formatDate(t) {
  if (typeof t == "number") t = new Date(t);
  return zp(t.getFullYear(), 4) + "-" + zp(t.getMonth() + 1, 2) + "-" + zp(t.getDate(), 2);
}

async function createWidget() {

  // Create new empty ListWidget instance
  let list = new ListWidget();

  let now = Date.now();
  //let now = 1638744625097;
  console.log(now);

  // get today + tomorrow
  let areaYesterday = await getSpotPrices(areaId, formatDate(now - 86400000));

  let areaToday = await getSpotPrices(areaId, formatDate(now));

  let areaTomorrow = await getSpotPrices(areaId, formatDate(now + 86400000));

  areaToday.values = areaYesterday.values.concat(areaToday.values, areaTomorrow.values);

  let values = extractValues(areaToday.values, now);
  let graphValues = makeGraphValues(values, now, graphWidth, graphHeight);

  // get current price
  let nowValue = areaToday.values.reduce((p, c) => {
    let dt = new Date(c[0]).getTime();
    return dt > now ? p : c;
  }, null)
  let nowIndex = areaToday.values.indexOf(nowValue)

  // get previous and next
  let prevValue = areaToday.values[nowIndex - 1] || nowValue;
  let nextValue = areaToday.values[nowIndex + 1] || nowValue;

  list.backgroundColor = new Color("#000000");

  let timeTx = list.addText(formatTime(nowValue, false) + "-" + formatTime(nextValue, false));
  timeTx.font = Font.lightSystemFont(12);
  timeTx.textColor = new Color("#ffffff");
  timeTx.centerAlignText()

  let priceStack = list.addStack();
  priceStack.size = new Size(120, 0)
  priceStack.centerAlignContent();

  let isPrevUp = nowValue[1] > prevValue[1];
  let prevTx = priceStack.addText(
    (!isPrevUp ? "▲" : "▼")
    + formatPrice(prevValue)
  );
  prevTx.centerAlignText();
  prevTx.font = Font.lightSystemFont(10);
  prevTx.textColor = new Color(!isPrevUp ? "#ff0000" : "#00ff00");

  priceStack.addSpacer(6);

  let priceTx = priceStack.addText(formatPrice(nowValue));
  priceTx.font = Font.heavySystemFont(26);
  priceTx.textColor = new Color("#ffffff");

  priceStack.addSpacer(6);

  let isNextUp = nextValue[1] > nowValue[1];
  let nextTx = priceStack.addText(
    (isNextUp ? "▲" : "▼")
    + formatPrice(nextValue)
  );
  nextTx.centerAlignText();
  nextTx.font = Font.lightSystemFont(10);
  nextTx.textColor = new Color(isNextUp ? "#ff0000" : "#00ff00");

  list.addSpacer(10)

  let im = drawGraphValues(graphValues, graphWidth, graphHeight);

  list.addImage(im);

  list.addSpacer(10);

  let maxValue = values[graphValues.max.index];
  let peakTx = list.addText("❗️ " + formatPrice(maxValue) + " @ " + formatTime(maxValue));
  peakTx.font = Font.lightSystemFont(12);
  peakTx.textColor = new Color("#ffffff");
  peakTx.centerAlignText();

  list.addSpacer(10);

  let updateTimeTx = list.addText(new Date().toLocaleTimeString());
  updateTimeTx.centerAlignText();
  updateTimeTx.font = Font.lightSystemFont(10);
  updateTimeTx.textColor = new Color("#666666");

  return list;
}