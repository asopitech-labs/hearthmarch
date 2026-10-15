# Terms

The rules in `src/game` store ids. These are the names the page speaks. Readings are for the ear; the screen shows the Japanese without furigana.

The language button is labeled with the other language (`日本語` while the page is English, `English` while it is Japanese). The choice is kept in `localStorage` under `hearthmarch.locale`. With nothing stored, a browser language that starts with `ja` opens in Japanese, and every other locale opens in English. Switching rewrites the page in place.

| English | Japanese | Reading | Note |
| --- | --- | --- | --- |
| Hearthmarch | ハースマーチ | はーすまーち | Katakana for the English title. |
| Reed Marsh | 葦の湿原 | あしのしつげん | The map. |
| Ashvale | 杏の谷 | あんずのたに | The player's kingdom. Apricot, for the orange ground. |
| Reedmoor | 葦の原 | あしのはら | The computer kingdom. |
| Lark, the Open Hand | 雲雀、ひらかれた掌 | ひばり、ひらかれたたなごころ | Meadows, courage, thorns. |
| Kiln, the Warm Stone | 窯、温かな石 | かま、あたたかないし | Shores, shaking ground, scorch. |
| Mere, the Still Water | 水鏡、静かなる水 | みずかがみ、しずかなるみず | Sinking meadows and the pull of water. |
| Seedbed | 芽吹き | めぶき | A wood becomes meadow. |
| Hearthwarm | 炉暖 | ろだん | One of your marchers grows stronger. |
| Briar | 茨 | いばら | A meadow grows into slowing wood. |
| Shore | 渚 | なぎさ | Water beside land becomes meadow. |
| Tremor | 地鳴り | じなり | Nearby marchers are shaken. |
| Cinder | 熾火 | おきび | A patch scorches, and enemy marchers burn. |
| Cut | 水落とし | みずおとし | A meadow sinks. |
| Drain | 水引き | みずびき | Water touching your land becomes meadow you hold. |
| Undertow | 引き波 | ひきなみ | An enemy marcher is drawn toward water. |
| marcher | 兵 | へい | A person in the field. 行軍 is the march itself, in the help text. |
| faith | 祈り | いのり | Spent on rites. |
| tax | 税 | ぜい | |
| gold | 金 | きん | |
| villagers | 村民 | そんみん | |
| tiles | 土地 | とち | |
| levy | 徴募 | ちょうぼ | Gold spent at once for a marcher. |
| rites | 儀礼 | ぎれい | |
| field notes | 野帳 | やちょう | The log. |
| Day | {day}日目 | にちめ | |
| a neighbor | 隣国 | りんごく | Ground taken from a kingdom that is no longer on the list. |
| A marcher | 兵 | へい | A fighter whose kingdom can no longer be named. |

Win: 葦の旗が降りる (あしのはたがおりる). Loss: 炉の火が消える (ろのひがきえる).
