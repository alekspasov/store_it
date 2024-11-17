"use server";

import { createAdminClient, createSessionClient } from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { Query, ID, Avatars, Client } from "node-appwrite";
import { parseStringify } from "@/lib/utils";
import { cookies } from "next/headers";
import { avatarPlaceholder } from "@/constants";
import { redirect } from "next/navigation";
const getUserByEmail = async (email: string) => {
  const { databases } = await createAdminClient();

  const result = await databases.listDocuments(
    appwriteConfig.databaseId,
    appwriteConfig.usersCollectionId,
    [Query.equal("email", [email])],
  );

  return result.total > 0 ? result.documents[0] : null;
};

const handleError = (error: unknown, message: string) => {
  console.log(error, message);
  throw error;
};

export const sendEmailOTP = async ({ email }: { email: string }) => {
  const { account } = await createAdminClient();

  try {
    const session = await account.createEmailToken(ID.unique(), email);

    return session.userId;
  } catch (err) {
    handleError(err, "Failed to send email OTP");
  }
};

export const createAccount = async ({
  fullName,
  email,
}: {
  fullName: string;
  email: string;
}) => {
  const existingUser = await getUserByEmail(email);
  const accountId = await sendEmailOTP({ email });
  if (!accountId) throw new Error("Failed to send an OTP");
  if (!existingUser) {
    const { databases } = await createAdminClient();
    const avatarUrl = await generateAvatar(fullName);
    await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.usersCollectionId,
      ID.unique(),
      {
        fullName,
        email,
        avatar: avatarUrl,
        accountId,
      },
    );
  }
  return parseStringify({ accountId });
};

export const verifySecret = async ({
  accountId,
  password,
}: {
  accountId: string;
  password: string;
}) => {
  try {
    const { account } = await createAdminClient();
    const session = await account.createSession(accountId, password);
    (await cookies()).set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });
    return parseStringify({ sessionId: session.$id });
  } catch (err) {
    handleError(err, "Failed to verify OTP");
  }
};

export const getCurrentUser = async () => {
  const { databases, account } = await createSessionClient();

  const result = await account.get();

  const user = await databases.listDocuments(
    appwriteConfig.databaseId,
    appwriteConfig.usersCollectionId,
    [Query.equal("accountId", [result.$id])],
  );

  if (user.total <= 0) return null;

  console.log(parseStringify(user.documents[0]));

  return parseStringify(user.documents[0]);
};

export const signOutUser = async () => {
  const { account } = await createSessionClient();

  try {
    await account.deleteSession("current");

    (await cookies()).delete("appwrite-session");
  } catch (err) {
    handleError(err, "Failed to sign out");
  } finally {
    redirect("/sign-in");
  }
};

export const signInUser = async ({ email }: { email: string }) => {
  try {
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      await sendEmailOTP({ email });
      return parseStringify({ accountId: existingUser.accountId });
    }
    return parseStringify({ accountId: null, error: "User not found" });
  } catch (err) {
    console.log(err);
  }
};

const generateAvatar = async (fullName: string) => {
  const { avatars } = await createAdminClient();
  const avatar = await avatars.getInitials(fullName, 100, 100);
  const base64String = Buffer.from(avatar).toString("base64");
  const avatarUrl = `data:image/png;base64,${base64String}`;
  return avatarUrl;
};