'use server'

import { FriendRequestsType } from "@/types";
import { getUserIdFromSession } from "@/lib";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@repo/prisma";
import { FriendRequestStatus } from "@repo/prisma"

//NEED IMPROVEMENT
export async function respondToFriendRequest(requestId: string, response: FriendRequestStatus) {
    if (!requestId || !response) {
        throw new Error('Request ID and response are required');
    }

    if (!(response in FriendRequestStatus)) {
        throw new Error('Invalid response');
    }

    try {
        await prisma.$transaction(async (prisma) => {
            if (response === FriendRequestStatus.ACCEPTED) {
                const friendRequest = await prisma.friendRequest.findUnique({
                    where: { id: requestId },
                    select: { senderId: true, receiverId: true },
                });
                if (!friendRequest) {
                    throw new Error('Friend request is invalid');
                }
                const { senderId, receiverId } = friendRequest;

                await prisma.friendship.createMany({
                    data: [
                        { userId: senderId, friendId: receiverId },
                        { userId: receiverId, friendId: senderId }
                    ],
                    skipDuplicates: true
                });

            }
            revalidatePath('/')
            return await prisma.friendRequest.delete({
                where: { id: requestId }
            });
        });
    } catch (error) {
        throw new Error('Something went wrong')
    }
}

export async function sendRequest(receiverEmail: string) {
    const senderId = await getUserIdFromSession();
    if (!senderId || !receiverEmail) {
        throw new Error('Sender ID and receiver email are required');
    }

    const receiver = await prisma.user.findUnique({
        where: {
            email: receiverEmail,
        },
    });

    if (!receiver) {
        throw new Error('Receiver not found');
    }

    try {
        const existingRequest = await prisma.friendRequest.findFirst({
            where: {
                senderId: senderId,
                receiverId: receiver.id,
            },
        });

        if (existingRequest) {
            throw new Error('Friend request already sent');
        }

        return await prisma.friendRequest.create({
            data: {
                senderId: senderId,
                receiverId: receiver.id,
                status: FriendRequestStatus.PENDING,
            },
        });
    } catch (error) {
        throw new Error('Something went wrong');
    }
}

export async function fetchFriendRequests(): Promise<FriendRequestsType> {
    try {
        const userId = await getUserIdFromSession();

        if (!userId) {
            throw new Error('User is not authenticated');
        }

        const [receivedRequests, sentRequests] = await Promise.all([
            prisma.friendRequest.findMany({
                where: {
                    receiverId: userId,
                    status: FriendRequestStatus.PENDING,
                },
                include: { sender: true },
            }),
            prisma.friendRequest.findMany({
                where: {
                    senderId: userId,
                    status: FriendRequestStatus.PENDING,
                },
                select: { receiverId: true },
            }),
        ]);

        return { receivedRequests, sentRequests };

    } catch (error) {
        throw new Error('An unknown error occurred while fetching friend requests');
    }
}

export async function removeFriend(friendId: string) {
    try {
        const userId = await getUserIdFromSession();
        await prisma.friendship.deleteMany({
            where: {
                OR: [
                    { userId: userId, friendId: friendId },
                    { userId: friendId, friendId: userId }
                ]
            }
        });
        revalidatePath('/');
    } catch (error) {
        console.log()
        throw new Error('An unknown error occurred while fetching friend requests');
    }
    return redirect('/')
}
