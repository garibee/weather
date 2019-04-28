"use strict";
var express = require('express');
var router = express.Router();

const axios = require('axios');
const request = require('request');
const qs = require('querystring');
const Iconv = require('iconv').Iconv;
const iconv = new Iconv('CP949', 'utf-8//translit//ignore');

const config = JSON.parse(require('fs').readFileSync('config/slack/api-key.json'));
const slackApiKey = config['slackApiKey'];
const slackChannelId = config['channelId'];
const weatherToken = config['weatherApiKey'];


const helper = {
    base: (function() {
        const timezone = new Date().toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul"
        });
        const currDate = new Date(timezone);
        const date = function() { // base_date
            const year = currDate.getFullYear();
            const month = (currDate.getMonth() < 10 ? '0' : '') + (currDate.getMonth() + 1);
            const day = currDate.getDate();
            const result = year + "" + month + "" + day;
            return result;
        };

        //api 형태 0030 (새벽 12시 30분) ~ 2330(밤 11시 30분)
        const time = function() { // 파라미터용 base_time
            let cur = "";

            // 밤 12시 
            if (currDate.getHours() == "00" || currDate.getHours() == "0") {
                cur = "23";

                //오전1시~ 9시
            } else if (currDate.getHours() >= 1 && currDate.getHours() <= 10) {
                cur = "0" + (currDate.getHours() - 1);
            } else {
                //현재시각
                cur = currDate.getHours() - 1;
            }

            return cur + "00";
        };

        const subTime = function(fcstTime) {
            fcstTime = fcstTime + "";
            const hour = fcstTime.substring(0, 2);
            const min = fcstTime.substring(2, 4);
            const time = hour + ":" + min;
            return time;
        };

        return {
            date: date,
            time: time,
            subTime: subTime
        }
    })(),
    key: (function() {
        const code = function(c) {
            // 초단기예보
            const data = [];
            data['T1H'] = "온도";
            data['RN1'] = "강수량";
            data['SKY'] = "대기상태";
            data['REH'] = "습도";
            data['PTY'] = "날씨";
            // data['LGT'] = "낙뢰";
            // data['VEC'] = "풍향";
            // data['WSD'] = "풍속";
            // data['UUU'] = "동서바람성분(m/s)";
            // data['VVV'] = "남북바람성분(m/s)";
            if (data[c] != null) {
                return data[c];
            } else {
                return c;
            }
        };

        const category = function(k, v) {
            if (k == 'PTY') { // 날씨
                switch (v) {
                    case 1:
                        return "비 :umbrella_with_rain_drops:";
                    case 2:
                        return "눈/비 :snow_cloud:/:umbrella_with_rain_drops:";
                    case 3:
                        return "눈 :snow_cloud:";
                    default:
                        return "맑음 :sun_with_face:";
                }
            } else if (k == 'SKY') { // 대기상태
                switch (v) {
                    case 2: //약간 흐림
                        return "약간 흐림 :sun_small_cloud:";
                    case 3: //다소 흐림
                        return "다소 흐림 :sun_behind_cloud:";
                    case 4: //구름많음
                        return "흐림 :fog:";
                    default:
                        return "맑음 :sun_with_face:";
                }
            } else if (k == 'RN1') { //시간당 강수량
                if (v == 100) return "70mm 이상";
                return v + "mm 미만";
            } else if (k == 'REH') {
                return v + "%";
            } else {
                return v + "도";
            }
        }

        return {
            code: code,
            category: category,
        }
    })(),
    send: (function() {
        const slack = function(string) {
            //https://api.slack.com/custom-integrations/legacy-tokens
            request.post("https://slack.com/api/chat.postMessage", {
                form: {
                    'username': '날씨 알리미',
                    'token': slackApiKey,
                    'channel': slackChannelId,
                    'text': string,
                }
            });
        }

        return {
            slack: slack
        }
    })(),
};

async function getWeather() {

    const weather = await axios.get("http://newsky2.kma.go.kr/service/SecndSrtpdFrcstInfoService2/ForecastTimeData", {
        params: {
            ServiceKey: qs.unescape(weatherToken),
            base_date: helper.base.date(),
            base_time: helper.base.time(),
            nx: "61",
            ny: "125", //대치동
            numOfRows: 100,
            pageNo: 1,
            _type: "json"
        }
    });
    return weather.data.response.body.items.item;
}

/*
unix-cron 형식 예제
 
* * * * * *
| | | | | | 
| | | | | +-- Year              (range: 1900-3000)
| | | | +---- Day of the Week   (range: 1-7, 1 standing for Monday)
| | | +------ Month of the Year (range: 1-12)
| | +-------- Day of the Month  (range: 1-31)
| +---------- Hour              (range: 0-23)
+------------ Minute            (range: 0-59)

* * * * * 매 분마다
0 * * * * 매 시마다
45 17 7 6 * *                       Every  year, on June 7th at 17:45

 */

// http://localhost:8080
router.get("/", async function(req, res) {
    const weather = await getWeather();
    const arr = [];

    const weathers = {};
    for (const i in weather) {
        if (weather[i].category == 'T1H' || weather[i].category == 'RN1' || weather[i].category == 'SKY' || weather[i].category == 'REH' || weather[i].category == 'PTY') {
            const fcstTime = helper.base.subTime(weather[i].fcstTime);

            if (typeof weathers[fcstTime] !== 'object') weathers[fcstTime] = {};
            weathers[fcstTime][weather[i].category] = {
                type: helper.key.code(weather[i].category),
                val: helper.key.category(weather[i].category, weather[i].fcstValue),
            }
        }
    }

    arr.push(weathers);
    let string = "";
    for (const i in weathers) {
        string += "`" + i + "시`\n";
        // string += "```";
        string += ">" + weathers[i].PTY.type + " : " + weathers[i].PTY.val + "\n";
        string += ">" + weathers[i].RN1.type + " : " + weathers[i].RN1.val + "\n";
        string += ">" + weathers[i].SKY.type + " : " + weathers[i].SKY.val + "\n";
        string += ">" + weathers[i].T1H.type + " : " + weathers[i].T1H.val + "\n";
        string += ">" + weathers[i].REH.type + " : " + weathers[i].REH.val + "\n";
        // string += "```";
        string += "\n";
    }

    helper.send.slack(string);

    const data = {
        list: arr
    }
    res.json(arr);
});

module.exports = router;