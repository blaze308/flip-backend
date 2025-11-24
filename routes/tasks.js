const express = require("express");
const router = express.Router();
const { authenticateJWT, requireAuth } = require("../middleware/jwtAuth");
const Task = require("../models/Task");
const UserTask = require("../models/UserTask");
const moment = require("moment");

// @route   GET /api/tasks
// @desc    Get all available tasks with user progress
// @access  Private
router.get("/", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { type } = req.query; // daily, weekly, achievement, etc.

    // Build query
    const query = { isActive: true };
    if (type) {
      query.type = type;
    }

    // Get all active tasks
    const tasks = await Task.find(query).sort({ sortOrder: 1, createdAt: 1 });

    // Get user progress for these tasks
    const taskIds = tasks.map((t) => t._id);
    const userTasks = await UserTask.find({
      user: user._id,
      task: { $in: taskIds },
    });

    // Map user progress to tasks
    const tasksWithProgress = tasks.map((task) => {
      const userTask = userTasks.find(
        (ut) => ut.task.toString() === task._id.toString()
      );

      return {
        ...task.toObject(),
        userProgress: userTask
          ? {
              progress: userTask.progress,
              isCompleted: userTask.isCompleted,
              isClaimed: userTask.isClaimed,
              completedAt: userTask.completedAt,
              claimedAt: userTask.claimedAt,
            }
          : {
              progress: 0,
              isCompleted: false,
              isClaimed: false,
            },
      };
    });

    res.json({
      success: true,
      message: "Tasks retrieved successfully",
      data: {
        tasks: tasksWithProgress,
      },
    });
  } catch (error) {
    console.error("Get tasks error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get tasks",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

// @route   POST /api/tasks/:taskId/claim
// @desc    Claim task rewards
// @access  Private
router.post("/:taskId/claim", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { taskId } = req.params;

    // Find user task
    const userTask = await UserTask.findOne({
      user: user._id,
      task: taskId,
    });

    if (!userTask) {
      return res.status(404).json({
        success: false,
        message: "Task not found or not started",
      });
    }

    // Claim rewards
    const rewards = await userTask.claimRewards();

    res.json({
      success: true,
      message: "Task rewards claimed successfully!",
      data: {
        rewards,
      },
    });
  } catch (error) {
    console.error("Claim task rewards error:", error);
    
    if (error.message === "Task not completed yet" || error.message === "Rewards already claimed") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to claim task rewards",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

// @route   GET /api/tasks/summary
// @desc    Get task completion summary for current user
// @access  Private
router.get("/summary", authenticateJWT, requireAuth, async (req, res) => {
  try {
    const user = req.user;

    const summary = await UserTask.aggregate([
      { $match: { user: user._id } },
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          completedTasks: {
            $sum: { $cond: ["$isCompleted", 1, 0] },
          },
          claimedTasks: {
            $sum: { $cond: ["$isClaimed", 1, 0] },
          },
        },
      },
    ]);

    const stats = summary[0] || {
      totalTasks: 0,
      completedTasks: 0,
      claimedTasks: 0,
    };

    res.json({
      success: true,
      message: "Task summary retrieved",
      data: stats,
    });
  } catch (error) {
    console.error("Get task summary error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get task summary",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

module.exports = router;

