import { useState, useEffect } from "react";
import { Box, Stack, Typography, IconButton, Avatar } from "@mui/material";
import {
    ChatBubbleOutline as MessageCircleIcon,
    Repeat as RepeatIcon,
    FavoriteBorder as HeartIcon,
    Share as ShareIcon
} from "@mui/icons-material";

export interface User {
    name: string;
    username: string;
    avatarUrl?: string;
}

export interface TweetData {
    user: User;
    content: string;
    timestamp: Date;
}

function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
        return `${diffInSeconds}秒前`;
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes}分前`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours}時間前`;
    } else {
        const days = Math.floor(diffInSeconds / 86400);
        return `${days}日前`;
    }
}

function Tweet({ user, content, timestamp }: Readonly<TweetData>) {
    const [relativeTime, setRelativeTime] = useState(formatRelativeTime(timestamp));

    useEffect(() => {
        const updateRelativeTime = () => {
            setRelativeTime(formatRelativeTime(timestamp));
        };

        updateRelativeTime();

        const interval = setInterval(updateRelativeTime, 60000);

        return () => clearInterval(interval);
    }, [timestamp]);

    return (
        <Box
            sx={{
                width: "100%",
                borderTop: "1px solid",
                borderBottom: "1px solid",
                borderColor: "divider",
                p: 2,
            }}
        >
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <Avatar sx={{ width: 48, height: 48 }} src={user.avatarUrl} />
                <Stack flex={1} spacing={0.5}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Typography fontWeight="bold">{user.name}</Typography>
                        <Typography color="text.secondary">@{user.username}</Typography>
                        <Typography color="text.secondary">·</Typography>
                        <Typography color="text.secondary">{relativeTime}</Typography>
                    </Stack>
                    <Typography>{content}</Typography>
                </Stack>
            </Stack>
            <Stack direction="row" spacing={0} pt={1} width="100%" justifyContent="space-around">
                <IconButton size="small">
                    <MessageCircleIcon fontSize="small" />
                </IconButton>
                <IconButton size="small">
                    <RepeatIcon fontSize="small" />
                </IconButton>
                <IconButton size="small">
                    <HeartIcon fontSize="small" />
                </IconButton>
                <IconButton size="small">
                    <ShareIcon fontSize="small" />
                </IconButton>
            </Stack>
        </Box>
    )
}

export function Timeline({ tweets }: Readonly<{ tweets: TweetData[] }>) {
    return (
        <Box
            sx={{
                flex: 1,
                borderRight: "1px solid",
                borderColor: "divider",
                height: "100vh",
            }}
        >
            <Box
                sx={{
                    p: 2,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    bgcolor: "background.paper",
                }}
            >
                <Typography variant="h5" fontWeight="bold">タイムライン</Typography>
            </Box>
            <Box sx={{ overflow: "auto", height: "calc(100vh - 80px)" }}>
                <Stack spacing={0}>
                    {tweets.map((tweet) => (
                        <Tweet key={`${tweet.user.username}-${tweet.timestamp.getTime()}`} {...tweet} />
                    ))}
                </Stack>
            </Box>
        </Box>
    )
}
