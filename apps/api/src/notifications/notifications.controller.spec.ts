import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import { NotificationsController } from "./notifications.controller";
import type { NotificationsFeedService } from "./notifications-feed.service";
import type { NotificationsService } from "./notifications.service";

function build(feedEnabled: "true" | "false") {
  const feedForUser = vi.fn().mockResolvedValue([{ id: "n1" }]);
  const feedService = { feedForUser } as unknown as NotificationsFeedService;
  const env = { NOTIFICATIONS_FEED_ENABLED: feedEnabled } as unknown as Env;
  const controller = new NotificationsController({} as NotificationsService, feedService, env);
  return { controller, feedForUser };
}

describe("NotificationsController.feed — non-core kill switch (roadmap 3.1)", () => {
  it("serves the feed normally when the switch is on", async () => {
    const { controller, feedForUser } = build("true");
    const res = await controller.feed("user-1");
    expect(feedForUser).toHaveBeenCalledWith("user-1");
    expect(res).toEqual([{ id: "n1" }]);
  });

  it("fails SOFT to an empty feed when the kill switch is off — never errors, never queries", async () => {
    const { controller, feedForUser } = build("false");
    const res = await controller.feed("user-1");
    expect(res).toEqual([]); // empty feed, not a 500
    expect(feedForUser).not.toHaveBeenCalled(); // the ~9-read synthesis is skipped entirely
  });
});
