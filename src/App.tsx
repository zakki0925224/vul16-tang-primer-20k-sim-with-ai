import { Box } from "@mui/material";
import { Simulator } from "./Simulator";
import { Timeline, type TweetData } from "./Timeline";
import { useState, useEffect } from "react";
import * as Llm from "./llm";

const TIMER_INTERVAL_SEC = 20; // 20s
const sampleTweets: TweetData[] = [
    {
        user: { name: "CPU", username: "vul16" },
        content: "今日はいい天気ですね！",
        timestamp: new Date()
    },
];

export default function App() {
    const [tweets, setTweets] = useState(sampleTweets);

    useEffect(() => {
        const timer = setInterval(() => {
            Llm.generateTextAsync("ツイートの内容を最大140文字で考えてください。出力がそのままツイートの内容になります。").then((text) => {
                const newTweet: TweetData = {
                    user: { name: Llm.getModelName(), username: "ai_bot" },
                    content: text,
                    timestamp: new Date()
                };
                console.log(newTweet);
                setTweets((prevTweets) => [newTweet, ...prevTweets]);
            });
        }, TIMER_INTERVAL_SEC * 1000);

        return () => clearInterval(timer);
    }, []);

    return (
        <Box sx={{ display: "flex", height: "100vh", width: "100%" }}>
            <Box sx={{ flex: 1, overflow: "auto" }}>
                <Simulator />
            </Box>
            <Box sx={{
                width: "25%",
                minWidth: "300px",
                overflow: "auto",
                borderLeft: 1,
                borderColor: "divider"
            }}>
                <Timeline tweets={tweets} />
            </Box>
        </Box>
    )
}
